/**
 * Numeric-aware sorting utilities for deterministic ordering
 */

import type { ImageFile, StyleFolder, ProductFolder } from "./types";

/**
 * Extract numeric part from filename for sorting
 * Returns [numeric_part, rest] for proper numeric sorting
 */
function extractNumericSortKey(filename: string): [number, string] {
  const match = filename.match(/^(\d+)/);
  if (match) {
    return [parseInt(match[1], 10), filename];
  }
  return [Infinity, filename.toLowerCase()];
}

/**
 * Sort numbered images by number ascending
 */
export function sortNumberedImages(images: ImageFile[]): ImageFile[] {
  return [...images].sort((a, b) => {
    if (a.number !== undefined && b.number !== undefined) {
      return a.number - b.number;
    }
    if (a.number !== undefined) return -1;
    if (b.number !== undefined) return 1;
    return a.filename.localeCompare(b.filename, undefined, { numeric: true });
  });
}

/**
 * Sort extra images (p1, p2, etc.) by number ascending
 */
export function sortExtraImages(images: ImageFile[]): ImageFile[] {
  return [...images].sort((a, b) => {
    if (a.number !== undefined && b.number !== undefined) {
      return a.number - b.number;
    }
    if (a.number !== undefined) return -1;
    if (b.number !== undefined) return 1;
    return a.filename.localeCompare(b.filename, undefined, { numeric: true });
  });
}

/**
 * Sort other images by filename (lexicographic, lowercased)
 */
export function sortOtherImages(images: ImageFile[]): ImageFile[] {
  return [...images].sort((a, b) =>
    a.filename.toLowerCase().localeCompare(b.filename.toLowerCase())
  );
}

/**
 * Sort style folders by name (lowercased)
 */
export function sortStyles(styles: StyleFolder[]): StyleFolder[] {
  return [...styles].sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  );
}

/**
 * Sort product folders:
 * - base_root_image products: keep stable order by filename
 * - product_folder products: sort by name (lowercased)
 */
export function sortProducts(products: ProductFolder[]): ProductFolder[] {
  return [...products].sort((a, b) => {
    // base_root_image products: sort by first image filename
    if (a.source === "base_root_image" && b.source === "base_root_image") {
      const aImg = a.root_images[0]?.filename || "";
      const bImg = b.root_images[0]?.filename || "";
      return aImg.localeCompare(bImg, undefined, { numeric: true });
    }
    if (a.source === "base_root_image") return -1;
    if (b.source === "base_root_image") return 1;
    
    // product_folder: sort by name
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
}

