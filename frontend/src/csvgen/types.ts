/**
 * Type definitions for CSV Generator (mirrors desktop models.py)
 */

export interface LocalFile {
  path: string; // Relative path like "ProductA/1.jpg"
  file: File;
}

export type ImageKind = "numbered" | "extra" | "other";

export interface ImageFile {
  path: string;
  filename: string;
  ext: string;
  kind: ImageKind;
  number?: number; // For numbered (1.jpg) and extra (p1.jpg)
  file: File; // Keep reference to original File
}

export interface StyleFolder {
  name: string;
  description_text?: string;
  root_images: ImageFile[]; // Numbered images
  extra_images: ImageFile[]; // p1/p2/px images
}

export type ProductSource = "base_root_image" | "product_folder";

export interface ProductFolder {
  name: string;
  source: ProductSource;
  has_styles: boolean;
  description_text?: string;
  root_images: ImageFile[]; // Numbered images (for product_folder without styles)
  extra_images: ImageFile[]; // p1/p2/px images (for product_folder without styles)
  styles: StyleFolder[];
}

export interface CsvRow {
  title: string;
  style: string;
  color: string;
  size: string;
  price: string;
  image: string; // Will be path for now (no uploads)
  description: string;
}

export interface GeneratorConfig {
  colors: string[];
  sizes: string[];
  base_price: number;
  step_price: number;
  image_mode: "parent_only" | "per_variation";
}

