/**
 * CSV Generator Page Component
 */

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CloudinarySettings, UploadProgress } from "../csvgen/cloudinary";
import { collectImages, uploadImages } from "../csvgen/cloudinary";
import { downloadCsv } from "../csvgen/csv";
import type { ImageResolver } from "../csvgen/generate";
import { buildRows, selfCheck } from "../csvgen/generate";
import { scanBaseFolder } from "../csvgen/scan";
import type { CsvRow, GeneratorConfig, ImageFile, LocalFile, ProductFolder } from "../csvgen/types";
import { PageHeader } from "./app/PageHeader";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function CsvGeneratorPage() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [products, setProducts] = useState<ProductFolder[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [scanSummary, setScanSummary] = useState<{
    productCount: number;
    styleCount: number;
    imageCount: number;
  } | null>(null);

  const [colors, setColors] = useState("Red, Blue");
  const [sizes, setSizes] = useState("S, M, L");
  const [basePrice, setBasePrice] = useState("10.0");
  const [stepPrice, setStepPrice] = useState("2.0");
  const [imageMode, setImageMode] = useState<"parent_only" | "per_variation">("parent_only");

  // Cloudinary settings
  const [cloudinaryCloudName, setCloudinaryCloudName] = useState("");
  const [cloudinaryUploadPreset, setCloudinaryUploadPreset] = useState("");
  const [cloudinaryFolderPrefix, setCloudinaryFolderPrefix] = useState("csvgen");
  const [uploadEnabled, setUploadEnabled] = useState(false);
  const [uploadConcurrency, setUploadConcurrency] = useState(4);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [imageUrlByPath, setImageUrlByPath] = useState<Map<string, string>>(new Map());

  // Debug mode
  const [debugMode, setDebugMode] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Handle file input (webkitdirectory)
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    const localFiles: LocalFile[] = selectedFiles.map((file) => {
      // webkitdirectory provides relative path in webkitRelativePath
      const path = (file as any).webkitRelativePath || file.name;
      return { path, file };
    });

    setFiles(localFiles);
    await handleScan(localFiles);
  };

  // Handle File System Access API (Chrome/Edge)
  const handleFolderPicker = async () => {
    if (!("showDirectoryPicker" in window)) {
      alert("File System Access API is not supported in this browser. Please use the file input instead.");
      return;
    }

    try {
      const dirHandle = await (window as any).showDirectoryPicker();
      const localFiles: LocalFile[] = [];

      async function readDirectory(
        dirHandle: any,
        path: string = ""
      ): Promise<void> {
        for await (const entry of dirHandle.values()) {
          const entryPath = path ? `${path}/${entry.name}` : entry.name;

          if (entry.kind === "file") {
            const file = await entry.getFile();
            localFiles.push({ path: entryPath, file });
          } else if (entry.kind === "directory") {
            await readDirectory(entry, entryPath);
          }
        }
      }

      await readDirectory(dirHandle);
      setFiles(localFiles);
      await handleScan(localFiles);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Error picking folder:", err);
        alert("Failed to read folder: " + err.message);
      }
    }
  };

  // Scan files
  const handleScan = async (filesToScan: LocalFile[]) => {
    try {
      const scannedProducts = await scanBaseFolder(filesToScan);
      setProducts(scannedProducts);

      // Calculate summary
      let styleCount = 0;
      let imageCount = 0;
      for (const product of scannedProducts) {
        if (product.has_styles) {
          styleCount += product.styles.length;
          for (const style of product.styles) {
            imageCount += style.root_images.length + style.extra_images.length;
          }
        } else {
          imageCount += product.root_images.length + product.extra_images.length;
        }
      }

      setScanSummary({
        productCount: scannedProducts.length,
        styleCount,
        imageCount,
      });
      setRows([]); // Clear previous rows
      setImageUrlByPath(new Map()); // Clear previous uploads
      setUploadProgress(null);
      setUploadErrors([]);
    } catch (err) {
      console.error("Scan error:", err);
      alert("Failed to scan folder: " + (err as Error).message);
    }
  };

  // Generate rows
  const handleGenerate = () => {
    if (products.length === 0) {
      alert("Please scan a folder first.");
      return;
    }

    const colorsList = colors
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    const sizesList = sizes
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (colorsList.length === 0 || sizesList.length === 0) {
      alert("Please provide at least one color and one size.");
      return;
    }

    const basePriceNum = parseFloat(basePrice);
    const stepPriceNum = parseFloat(stepPrice);

    if (isNaN(basePriceNum) || isNaN(stepPriceNum)) {
      alert("Please provide valid price numbers.");
      return;
    }

    const config: GeneratorConfig = {
      colors: colorsList,
      sizes: sizesList,
      base_price: basePriceNum,
      step_price: stepPriceNum,
      image_mode: imageMode,
    };

    // Image resolver: use Cloudinary URL if available, else local path
    const resolveImage: ImageResolver = (imageFile: ImageFile) => {
      return imageUrlByPath.get(imageFile.path) || imageFile.path;
    };

    const generatedRows = buildRows(products, config, resolveImage);
    setRows(generatedRows);

    // Self-check
    const check = selfCheck(products, generatedRows);
    console.log("Self-check:", check);

    // Debug logging
    if (debugMode) {
      console.log("=== DEBUG MODE ===");
      console.log(`Total products: ${products.length}`);
      console.log(`Total rows generated: ${generatedRows.length}`);
      
      // Sample image paths from upload collection
      const allImages = collectImages(products);
      console.log(`Total unique images (by path): ${allImages.length}`);
      if (allImages.length > 0) {
        console.log("Sample image paths (first 20):");
        allImages.slice(0, 20).forEach((img, idx) => {
          console.log(`  ${idx + 1}. ${img.path}`);
        });
      }
      
      // Sample imageUrlByPath keys
      if (imageUrlByPath.size > 0) {
        console.log(`Uploaded images in map: ${imageUrlByPath.size}`);
        console.log("Sample imageUrlByPath keys (first 10):");
        Array.from(imageUrlByPath.keys()).slice(0, 10).forEach((path, idx) => {
          console.log(`  ${idx + 1}. ${path} -> ${imageUrlByPath.get(path)?.substring(0, 50)}...`);
        });
      }
      
      // Sample row mappings
      console.log("Sample CSV row image mappings (first 10):");
      generatedRows.slice(0, 10).forEach((row, idx) => {
        console.log(`  ${idx + 1}. Image: ${row.image.substring(0, 60)}${row.image.length > 60 ? "..." : ""}`);
      });
      
      console.log("=== END DEBUG ===");
    }
  };

  // Download CSV
  const handleDownload = () => {
    if (rows.length === 0) {
      alert("Please generate rows first.");
      return;
    }

    downloadCsv(rows, "csv_generator_output.csv");
  };

  // Upload images to Cloudinary
  const handleUpload = async () => {
    if (!cloudinaryCloudName || !cloudinaryUploadPreset) {
      alert("Please provide Cloud Name and Upload Preset");
      return;
    }

    if (products.length === 0) {
      alert("Please scan a folder first");
      return;
    }

    setIsUploading(true);
    setUploadErrors([]);
    setUploadProgress({ total: 0, uploaded: 0, failed: 0 });

    try {
      const images = collectImages(products);

      if (images.length === 0) {
        alert("No images found to upload");
        setIsUploading(false);
        return;
      }

      // Generate unique jobId per upload session (timestamp)
      const jobId = Date.now().toString();

      const settings: CloudinarySettings = {
        cloudName: cloudinaryCloudName,
        uploadPreset: cloudinaryUploadPreset,
        folderPrefix: cloudinaryFolderPrefix,
        jobId, // Unique per-run identifier
      };

      const urlMap = await uploadImages(
        images,
        settings,
        uploadConcurrency,
        (progress) => {
          setUploadProgress(progress);
        }
      );

      setImageUrlByPath(urlMap);

      // Collect failed uploads
      const failedPaths: string[] = [];
      for (const img of images) {
        if (!urlMap.has(img.path)) {
          failedPaths.push(img.path);
        }
      }

      if (failedPaths.length > 0) {
        setUploadErrors(failedPaths);
        alert(`Upload completed with ${failedPaths.length} failures. Check console for details.`);
      } else {
        alert(`Successfully uploaded ${urlMap.size} images`);
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      alert("Upload failed: " + error.message);
      setUploadErrors([error.message]);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.csvGenerator")}
        description="Generate CSV files from product folder structures"
      />

      {/* Step 1: Choose folder */}
      <Card>
        <CardHeader>
          <CardTitle>Step 1: Choose Folder</CardTitle>
          <CardDescription>
            Select a folder containing product images and descriptions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="file-input">Select folder (File Input)</Label>
              <Input
                id="file-input"
                ref={fileInputRef}
                type="file"
                // @ts-ignore - webkitdirectory is a valid HTML attribute
                webkitdirectory=""
                multiple
                onChange={handleFileInputChange}
                className="mt-2"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                onClick={handleFolderPicker}
              >
                Choose folder (Chrome/Edge)
              </Button>
            </div>
          </div>
          {files.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {files.length} files selected
            </p>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Scan summary */}
      {scanSummary && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2: Scan Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Products</p>
                <p className="text-2xl font-bold">{scanSummary.productCount}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Styles</p>
                <p className="text-2xl font-bold">{scanSummary.styleCount}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Images</p>
                <p className="text-2xl font-bold">{scanSummary.imageCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Config */}
      <Card>
        <CardHeader>
          <CardTitle>Step 3: Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="colors">Colors (comma-separated)</Label>
            <Input
              id="colors"
              value={colors}
              onChange={(e) => setColors(e.target.value)}
              placeholder="Red, Blue, Green"
              className="mt-2"
            />
          </div>
          <div>
            <Label htmlFor="sizes">Sizes (comma-separated)</Label>
            <Input
              id="sizes"
              value={sizes}
              onChange={(e) => setSizes(e.target.value)}
              placeholder="S, M, L, XL"
              className="mt-2"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="base-price">Base Price</Label>
              <Input
                id="base-price"
                type="number"
                step="0.01"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="step-price">Step Price</Label>
              <Input
                id="step-price"
                type="number"
                step="0.01"
                value={stepPrice}
                onChange={(e) => setStepPrice(e.target.value)}
                className="mt-2"
              />
            </div>
          </div>
          <div>
            <Label>Image Mode</Label>
            <div className="flex gap-4 mt-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="parent_only"
                  checked={imageMode === "parent_only"}
                  onChange={() => setImageMode("parent_only")}
                />
                <span>Parent-only image</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="per_variation"
                  checked={imageMode === "per_variation"}
                  onChange={() => setImageMode("per_variation")}
                />
                <span>Per-variation image</span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 3.5: Cloudinary Upload (Optional) */}
      <Card>
        <CardHeader>
          <CardTitle>Step 3.5: Cloudinary Upload (Optional)</CardTitle>
          <CardDescription>
            Upload images to Cloudinary. CSV will use Cloudinary URLs instead of local paths.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="upload-enabled"
              checked={uploadEnabled}
              onChange={(e) => setUploadEnabled(e.target.checked)}
            />
            <Label htmlFor="upload-enabled">Upload images to Cloudinary</Label>
          </div>

          {uploadEnabled && (
            <>
              <div>
                <Label htmlFor="cloudinary-cloud-name">Cloud Name *</Label>
                <Input
                  id="cloudinary-cloud-name"
                  value={cloudinaryCloudName}
                  onChange={(e) => setCloudinaryCloudName(e.target.value)}
                  placeholder="your-cloud-name"
                  className="mt-2"
                  disabled={isUploading}
                />
              </div>
              <div>
                <Label htmlFor="cloudinary-upload-preset">Unsigned Upload Preset *</Label>
                <Input
                  id="cloudinary-upload-preset"
                  value={cloudinaryUploadPreset}
                  onChange={(e) => setCloudinaryUploadPreset(e.target.value)}
                  placeholder="your-upload-preset"
                  className="mt-2"
                  disabled={isUploading}
                />
              </div>
              <div>
                <Label htmlFor="cloudinary-folder-prefix">Folder Prefix</Label>
                <Input
                  id="cloudinary-folder-prefix"
                  value={cloudinaryFolderPrefix}
                  onChange={(e) => setCloudinaryFolderPrefix(e.target.value)}
                  placeholder="csvgen"
                  className="mt-2"
                  disabled={isUploading}
                />
              </div>
              <div>
                <Label htmlFor="upload-concurrency">Concurrency (1-6)</Label>
                <Input
                  id="upload-concurrency"
                  type="number"
                  min="1"
                  max="6"
                  value={uploadConcurrency}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 1 && val <= 6) {
                      setUploadConcurrency(val);
                    }
                  }}
                  className="mt-2"
                  disabled={isUploading}
                />
              </div>

              <Button
                onClick={handleUpload}
                disabled={isUploading || !cloudinaryCloudName || !cloudinaryUploadPreset || products.length === 0}
              >
                {isUploading ? "Uploading..." : "Upload Images"}
              </Button>

              {uploadProgress && (
                <div className="space-y-2 p-4 bg-muted rounded-md">
                  <div className="flex justify-between text-sm">
                    <span>Progress: {uploadProgress.uploaded} / {uploadProgress.total}</span>
                    <span>Failed: {uploadProgress.failed}</span>
                  </div>
                  {uploadProgress.current && (
                    <p className="text-xs text-muted-foreground">
                      Current: {uploadProgress.current}
                    </p>
                  )}
                  {uploadProgress.total > 0 && (
                    <div className="w-full bg-background rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{
                          width: `${(uploadProgress.uploaded / uploadProgress.total) * 100}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {uploadErrors.length > 0 && (
                <div className="p-4 bg-destructive/10 rounded-md">
                  <p className="text-sm font-medium text-destructive mb-2">
                    Failed uploads ({uploadErrors.length}):
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
                    {uploadErrors.map((error, idx) => (
                      <li key={idx}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {imageUrlByPath.size > 0 && (
                <div className="p-4 bg-green-50 dark:bg-green-950 rounded-md">
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">
                    ✓ {imageUrlByPath.size} images uploaded successfully
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Step 4: Generate */}
      <Card>
        <CardHeader>
          <CardTitle>Step 4: Generate Rows</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Button onClick={handleGenerate} disabled={products.length === 0}>
              Generate Rows
            </Button>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={debugMode}
                onChange={(e) => setDebugMode(e.target.checked)}
              />
              <span className="text-sm">Debug Mode</span>
            </label>
          </div>
          {rows.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground">
                Generated {rows.length} rows
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 5: Download */}
      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Step 5: Download CSV</CardTitle>
          </CardHeader>
          <CardContent>
            <Button onClick={handleDownload}>Download CSV</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

