/**
 * Cloudinary upload functionality (direct from browser)
 */

import type { ImageFile, ProductFolder } from "./types";

export interface CloudinarySettings {
  cloudName: string;
  uploadPreset: string;
  folderPrefix: string;
  jobId: string; // Unique per-run identifier to prevent collisions
}

export interface UploadResult {
  path: string;
  secureUrl: string;
  publicId: string;
}

export interface UploadProgress {
  total: number;
  uploaded: number;
  failed: number;
  current?: string;
}

/**
 * Collect all unique images from products (de-duplicated by path)
 */
export function collectImages(products: ProductFolder[]): ImageFile[] {
  const imageMap = new Map<string, ImageFile>();

  for (const product of products) {
    // Root images
    for (const img of product.root_images) {
      if (!imageMap.has(img.path)) {
        imageMap.set(img.path, img);
      }
    }

    // Extra images
    for (const img of product.extra_images) {
      if (!imageMap.has(img.path)) {
        imageMap.set(img.path, img);
      }
    }

    // Style images (safe iteration)
    for (const style of product.styles ?? []) {
      for (const img of style.root_images) {
        if (!imageMap.has(img.path)) {
          imageMap.set(img.path, img);
        }
      }
      for (const img of style.extra_images) {
        if (!imageMap.has(img.path)) {
          imageMap.set(img.path, img);
        }
      }
    }
  }

  return Array.from(imageMap.values());
}

/**
 * Sanitize path to create safe public_id for Cloudinary
 * Preserves folder structure, removes extension
 * e.g. "ProductA/Style1/1.jpg" -> "ProductA/Style1/1"
 */
export function sanitizePath(path: string): string {
  // Remove extension
  const withoutExt = path.substring(0, path.lastIndexOf("."));
  
  // Replace spaces with underscores
  let sanitized = withoutExt.replace(/\s+/g, "_");
  
  // Remove dangerous characters (keep alphanumeric, underscore, slash, hyphen)
  sanitized = sanitized.replace(/[^a-zA-Z0-9_\/\-]/g, "");
  
  // Remove leading/trailing slashes
  sanitized = sanitized.replace(/^\/+|\/+$/g, "");
  
  return sanitized;
}

/**
 * Validate file before upload
 */
function validateFile(file: File): { valid: boolean; error?: string } {
  // Check file type
  const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!validTypes.includes(file.type.toLowerCase())) {
    return {
      valid: false,
      error: `Invalid file type: ${file.type}. Only JPG, PNG, and WebP are allowed.`,
    };
  }

  // Check file size (25MB limit)
  const maxSize = 25 * 1024 * 1024; // 25MB in bytes
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum size is 25MB.`,
    };
  }

  return { valid: true };
}

/**
 * Upload a single image to Cloudinary
 */
export async function uploadOne(
  imageFile: ImageFile,
  settings: CloudinarySettings,
  retryCount: number = 0
): Promise<UploadResult> {
  const validation = validateFile(imageFile.file);
  if (!validation.valid) {
    throw new Error(validation.error || "File validation failed");
  }

  // Generate unique public_id: folderPrefix/jobId/sanitizedPath
  // Example: csvgen/1700000000/ProductA/7
  const sanitizedPath = sanitizePath(imageFile.path);
  const publicId = `${settings.folderPrefix}/${settings.jobId}/${sanitizedPath}`;

  const formData = new FormData();
  formData.append("file", imageFile.file);
  formData.append("upload_preset", settings.uploadPreset);
  formData.append("resource_type", "image");
  formData.append("public_id", publicId);
  // Note: overwrite parameter is not allowed in unsigned uploads
  // Collision prevention is handled via unique public_id (jobId + full path)

  const url = `https://api.cloudinary.com/v1_1/${settings.cloudName}/image/upload`;

  try {
    const response = await fetch(url, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      // 4xx errors: don't retry
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Upload failed: ${response.status} ${errorText}`);
      }

      // 5xx or network errors: retry if attempts remain
      if (retryCount < 2) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s
        await new Promise((resolve) => setTimeout(resolve, delay));
        return uploadOne(imageFile, settings, retryCount + 1);
      }

      throw new Error(`Upload failed after retries: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const secureUrl = data.secure_url;

    if (!secureUrl) {
      throw new Error("Upload succeeded but no secure_url in response");
    }

    return {
      path: imageFile.path,
      secureUrl,
      publicId: data.public_id || publicId,
    };
  } catch (error: any) {
    // Network errors: retry if attempts remain
    if (retryCount < 2 && (error.name === "TypeError" || error.message.includes("fetch"))) {
      const delay = Math.pow(2, retryCount) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return uploadOne(imageFile, settings, retryCount + 1);
    }

    throw error;
  }
}

/**
 * Upload images with concurrency control
 */
export async function uploadImages(
  images: ImageFile[],
  settings: CloudinarySettings,
  concurrency: number = 4,
  onProgress?: (progress: UploadProgress) => void
): Promise<Map<string, string>> {
  // Validate settings
  if (!settings.cloudName || !settings.uploadPreset) {
    throw new Error("Cloud Name and Upload Preset are required");
  }

  // Cap concurrency at 6
  const actualConcurrency = Math.min(Math.max(1, concurrency), 6);

  const imageUrlByPath = new Map<string, string>();
  const failed: string[] = [];
  let uploaded = 0;
  let currentIndex = 0;

  // Upload queue
  const uploadQueue: Promise<void>[] = [];

  const uploadNext = async (): Promise<void> => {
    while (currentIndex < images.length) {
      const index = currentIndex++;
      const image = images[index];

      try {
        onProgress?.({
          total: images.length,
          uploaded,
          failed: failed.length,
          current: image.filename,
        });

        const result = await uploadOne(image, settings);
        imageUrlByPath.set(result.path, result.secureUrl);
        uploaded++;

        onProgress?.({
          total: images.length,
          uploaded,
          failed: failed.length,
          current: image.filename,
        });
      } catch (error: any) {
        failed.push(image.path);
        console.error(`Failed to upload ${image.path}:`, error);

        onProgress?.({
          total: images.length,
          uploaded,
          failed: failed.length,
          current: image.filename,
        });
      }
    }
  };

  // Start concurrent uploads
  for (let i = 0; i < actualConcurrency; i++) {
    uploadQueue.push(uploadNext());
  }

  // Wait for all uploads to complete
  await Promise.all(uploadQueue);

  // Final progress update
  onProgress?.({
    total: images.length,
    uploaded,
    failed: failed.length,
  });

  if (failed.length > 0) {
    console.warn("Some uploads failed:", failed);
  }

  return imageUrlByPath;
}

