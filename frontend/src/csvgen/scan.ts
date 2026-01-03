/**
 * Client-side scanner that mirrors desktop scanner.py behavior
 */

import type { LocalFile, ImageFile, ProductFolder, StyleFolder } from "./types";
import {
  sortNumberedImages,
  sortExtraImages,
  sortOtherImages,
  sortStyles,
  sortProducts,
} from "./sort";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

/**
 * Check if file is an image
 */
function isImageFile(filename: string): boolean {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf("."));
  return IMAGE_EXTENSIONS.has(ext);
}

/**
 * Check if filename is Description.txt (case-insensitive)
 */
function isDescriptionFile(filename: string): boolean {
  return filename.toLowerCase() === "description.txt";
}

/**
 * Classify image file: numbered, extra, or other
 */
function classifyImage(filename: string): {
  kind: ImageFile["kind"];
  number?: number;
} {
  const nameWithoutExt = filename.substring(0, filename.lastIndexOf("."));
  const lower = nameWithoutExt.toLowerCase();

  // Extra images: p1.jpg, p2.jpg, etc.
  const extraMatch = lower.match(/^p(\d+)$/);
  if (extraMatch) {
    return { kind: "extra", number: parseInt(extraMatch[1], 10) };
  }

  // Numbered images: 1.jpg, 2.jpg, etc.
  const numberedMatch = nameWithoutExt.match(/^(\d+)$/);
  if (numberedMatch) {
    return { kind: "numbered", number: parseInt(numberedMatch[1], 10) };
  }

  return { kind: "other" };
}

/**
 * Create ImageFile from LocalFile
 */
function createImageFile(localFile: LocalFile): ImageFile {
  const filename = localFile.path.split("/").pop() || "";
  const ext = filename.substring(filename.lastIndexOf("."));
  const classification = classifyImage(filename);

  return {
    path: localFile.path,
    filename,
    ext: ext.toLowerCase(),
    kind: classification.kind,
    number: classification.number,
    file: localFile.file,
  };
}

/**
 * Read description from LocalFile list for a given folder path
 */
async function readDescription(
  files: LocalFile[],
  folderPath: string
): Promise<string | undefined> {
  // Look for Description.txt in this folder
  const descPath = folderPath
    ? `${folderPath}/Description.txt`
    : "Description.txt";
  const descFile = files.find(
    (f) =>
      f.path.toLowerCase() === descPath.toLowerCase() &&
      isDescriptionFile(f.path.split("/").pop() || "")
  );

  if (!descFile) {
    return undefined;
  }

  try {
    const text = await descFile.file.text();
    return text.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Get files in a specific folder
 * Returns files with FULL ORIGINAL PATHS (not truncated)
 */
function getFilesInFolder(
  files: LocalFile[],
  folderPath: string
): LocalFile[] {
  if (!folderPath) {
    // Root level: files with no "/" in path
    return files.filter((f) => !f.path.includes("/"));
  }

  const prefix = `${folderPath}/`;
  return files
    .filter((f) => {
      // Check if file is in this folder
      if (!f.path.startsWith(prefix)) return false;
      
      // Check if it's a direct child (no additional "/" after prefix)
      const relative = f.path.substring(prefix.length);
      return !relative.includes("/");
    });
  // DO NOT modify path - keep full original path for deduplication and mapping
}

/**
 * Get subdirectories in a folder
 */
function getSubdirectories(
  files: LocalFile[],
  folderPath: string
): string[] {
  const prefix = folderPath ? `${folderPath}/` : "";
  const dirs = new Set<string>();

  for (const file of files) {
    if (!file.path.startsWith(prefix)) continue;

    const relative = file.path.substring(prefix.length);
    const parts = relative.split("/");
    if (parts.length > 1) {
      dirs.add(parts[0]);
    }
  }

  return Array.from(dirs).sort();
}

/**
 * Scan base folder and return ProductFolder list
 */
export async function scanBaseFolder(
  files: LocalFile[]
): Promise<ProductFolder[]> {
  const products: ProductFolder[] = [];

  // CASE 1: Root images (images directly in base root)
  // Root files are those with no "/" in path (or just filename)
  const rootFiles = files.filter((f) => {
    const pathParts = f.path.split("/");
    return pathParts.length === 1 && isImageFile(f.path);
  });
  const rootImages = rootFiles.map(createImageFile);

  if (rootImages.length > 0) {
    const rootDesc = await readDescription(files, "");

    // Each root image becomes a separate product
    for (const img of rootImages) {
      products.push({
        name: img.filename.substring(0, img.filename.lastIndexOf(".")), // stem
        source: "base_root_image",
        has_styles: false,
        description_text: rootDesc,
        root_images: [img],
        extra_images: [],
        styles: [],
      });
    }
  }

  // CASE 2 & 3: Product folders (subdirectories)
  const productDirs = getSubdirectories(files, "");

  for (const productDir of productDirs) {
    const productFiles = getFilesInFolder(files, productDir);
    const productImages = productFiles
      .filter((f) => isImageFile(f.path))
      .map(createImageFile);

    // Check for style subfolders
    const styleDirs = getSubdirectories(files, productDir);

    if (styleDirs.length > 0) {
      // CASE 3: Product with styles
      const styles: StyleFolder[] = [];

      for (const styleDir of styleDirs) {
        const stylePath = `${productDir}/${styleDir}`;
        const styleFiles = getFilesInFolder(files, stylePath);
        const styleImages = styleFiles
          .filter((f) => isImageFile(f.path))
          .map(createImageFile);

        const styleDesc = await readDescription(files, stylePath);

        // Separate numbered vs extra images (as per requirements)
        const numbered = sortNumberedImages(
          styleImages.filter((img) => img.kind === "numbered")
        );
        const extra = sortExtraImages(
          styleImages.filter((img) => img.kind === "extra")
        );
        const other = sortOtherImages(
          styleImages.filter((img) => img.kind === "other")
        );

        styles.push({
          name: styleDir,
          description_text: styleDesc,
          root_images: [...numbered, ...other], // Numbered + other
          extra_images: extra, // p1, p2, etc.
        });
      }

      products.push({
        name: productDir,
        source: "product_folder",
        has_styles: true,
        description_text: undefined, // Styles have their own descriptions
        root_images: [],
        extra_images: [],
        styles: sortStyles(styles),
      });
    } else {
      // CASE 2: Product without styles
      const productDesc = await readDescription(files, productDir);

      // Separate numbered vs extra images (as per requirements)
      const numbered = sortNumberedImages(
        productImages.filter((img) => img.kind === "numbered")
      );
      const extra = sortExtraImages(
        productImages.filter((img) => img.kind === "extra")
      );
      const other = sortOtherImages(
        productImages.filter((img) => img.kind === "other")
      );

      products.push({
        name: productDir,
        source: "product_folder",
        has_styles: false,
        description_text: productDesc,
        root_images: [...numbered, ...other], // Numbered + other
        extra_images: extra, // p1, p2, etc.
        styles: [], // Always include styles array, even when empty
      });
    }
  }

  return sortProducts(products);
}

