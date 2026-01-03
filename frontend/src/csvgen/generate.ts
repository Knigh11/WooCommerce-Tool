/**
 * Client-side generator that mirrors desktop generator.py branching
 */

import type {
  ProductFolder,
  CsvRow,
  GeneratorConfig,
  ImageFile,
} from "./types";

const TITLE_BLACKLIST = new Set([
  "front",
  "back",
  "mockup",
  "preview",
  "thumbnail",
]);

/**
 * Extract title from image filename if meaningful (CASE 1 only)
 * Numeric or pX filenames must NEVER be used as title
 */
function extractTitleFromImage(
  image: ImageFile,
  productTitle: string
): string {
  const namePart = image.filename.substring(
    0,
    image.filename.lastIndexOf(".")
  );
  const nameLower = namePart.toLowerCase();

  // Numeric or pX filenames must NEVER be used as title
  if (namePart.match(/^\d+$/) || nameLower.match(/^p\d+$/)) {
    return productTitle;
  }

  // Check if meaningful (not in blacklist)
  if (!TITLE_BLACKLIST.has(nameLower)) {
    return namePart;
  }

  return productTitle;
}

/**
 * Resolve image reference to string (local path or Cloudinary URL)
 */
export type ImageResolver = (imageFile: ImageFile) => string;

const defaultImageResolver: ImageResolver = (imageFile: ImageFile) => {
  return imageFile.path;
};

/**
 * Build CSV rows from products (mirrors desktop generator.py)
 */
export function buildRows(
  products: ProductFolder[],
  config: GeneratorConfig,
  resolveImage: ImageResolver = defaultImageResolver
): CsvRow[] {
  const rows: CsvRow[] = [];
  const singleColorMode = config.colors.length === 1;

  for (const product of products) {
    // ===== CASE 1: BASE ROOT IMAGES (each image = one product) =====
    if (
      product.source === "base_root_image" &&
      product.root_images.length > 0
    ) {
      for (const img of product.root_images) {
        const title = extractTitleFromImage(img, product.name);
        const description = product.description_text || "";

        // Generate rows for each color x size
        let firstRow = true;
        for (const color of config.colors) {
          for (let i = 0; i < config.sizes.length; i++) {
            const size = config.sizes[i];
            const price = config.base_price + config.step_price * i;

            // Image mode logic
            let imgForRow = "";
            if (config.image_mode === "parent_only") {
              if (firstRow) {
                imgForRow = resolveImage(img);
                firstRow = false;
              }
            } else {
              // per_variation: every row gets image
              imgForRow = resolveImage(img);
            }

            rows.push({
              title,
              style: "",
              color,
              size,
              price: price.toString(),
              image: imgForRow,
              description,
            });
          }
        }
      }
    }
    // ===== CASE 2: PRODUCT FOLDER WITHOUT STYLES =====
    else if (
      product.source === "product_folder" &&
      !product.has_styles &&
      product.root_images.length > 0
    ) {
      const description = product.description_text || "";

      // Title MUST ALWAYS be product folder name (NO image name inference)
      const finalTitle = product.name;

      // Build color-image map (mirrors desktop logic exactly)
      const colorImageMap: Record<string, string> = {};
      const extraImagePaths: string[] = [];
      let mainSingleImage = "";

      // Process root_images (numbered + other) for color mapping
      for (const img of product.root_images) {
        const namePart = img.filename.substring(0, img.filename.lastIndexOf("."));

        if (singleColorMode) {
          // 1 color: first image = main, others = extra
          if (!mainSingleImage) {
            mainSingleImage = resolveImage(img);
            colorImageMap[config.colors[0]] = resolveImage(img);
          } else {
            extraImagePaths.push(resolveImage(img));
          }
        } else {
          // Multiple colors: numbered images map to color index, others = extra
          if (namePart.match(/^\d+$/)) {
            // Numbered image: 1.jpg -> colors[0], 2.jpg -> colors[1], etc.
            const imgIndex = parseInt(namePart, 10);
            const colorIdx = imgIndex - 1;
            if (colorIdx >= 0 && colorIdx < config.colors.length) {
              colorImageMap[config.colors[colorIdx]] = resolveImage(img);
            }
          } else {
            // Other (non-numbered) image -> extra
            extraImagePaths.push(resolveImage(img));
          }
        }
      }

      // Process extra_images (pX) - all go to extra rows
      for (const img of product.extra_images) {
        extraImagePaths.push(resolveImage(img));
      }

      // Generate main rows (Color x Size)
      let firstRow = true;
      for (const color of config.colors) {
        const imageUrl = colorImageMap[color] || "";

        for (let i = 0; i < config.sizes.length; i++) {
          const size = config.sizes[i];
          const price = config.base_price + config.step_price * i;

          // Image mode logic
          let imgForRow = "";
          if (config.image_mode === "parent_only") {
            if (firstRow && imageUrl) {
              imgForRow = imageUrl;
              firstRow = false;
            }
          } else {
            imgForRow = imageUrl;
          }

          rows.push({
            title: finalTitle,
            style: "",
            color,
            size,
            price: price.toString(),
            image: imgForRow,
            description,
          });
        }
      }

      // Extra images as separate rows
      for (const extraPath of extraImagePaths) {
        rows.push({
          title: finalTitle,
          style: "",
          color: "",
          size: "",
          price: "",
          image: extraPath,
          description,
        });
      }
    }
    // ===== CASE 3: PRODUCT WITH STYLES =====
    else if (product.has_styles) {
      for (const style of product.styles) {
        const description = style.description_text || "";

        // Title MUST ALWAYS be product folder name (NO image name inference)
        const finalTitle = product.name;

        // Build color-image map (mirrors desktop logic exactly)
        const colorImageMap: Record<string, string> = {};
        const extraImagePaths: string[] = [];
        let mainSingleImage = "";

        // Process style.root_images (numbered + other) for color mapping
        for (const img of style.root_images) {
          const namePart = img.filename.substring(0, img.filename.lastIndexOf("."));

          if (singleColorMode) {
            // 1 color: first image = main, others = extra
            if (!mainSingleImage) {
              mainSingleImage = resolveImage(img);
              colorImageMap[config.colors[0]] = resolveImage(img);
            } else {
              extraImagePaths.push(resolveImage(img));
            }
          } else {
            // Multiple colors: numbered images map to color index, others = extra
            if (namePart.match(/^\d+$/)) {
              // Numbered image: 1.jpg -> colors[0], 2.jpg -> colors[1], etc.
              const imgIndex = parseInt(namePart, 10);
              const colorIdx = imgIndex - 1;
              if (colorIdx >= 0 && colorIdx < config.colors.length) {
                colorImageMap[config.colors[colorIdx]] = resolveImage(img);
              }
            } else {
              // Other (non-numbered) image -> extra
              extraImagePaths.push(resolveImage(img));
            }
          }
        }

        // Process style.extra_images (pX) - all go to extra rows
        for (const img of style.extra_images) {
          extraImagePaths.push(resolveImage(img));
        }

        // Generate main rows (Color x Size)
        let firstRow = true;
        for (const color of config.colors) {
          const imageUrl = colorImageMap[color] || "";

          for (let i = 0; i < config.sizes.length; i++) {
            const size = config.sizes[i];
            const price = config.base_price + config.step_price * i;

            // Image mode logic
            let imgForRow = "";
            if (config.image_mode === "parent_only") {
              if (firstRow && imageUrl) {
                imgForRow = imageUrl;
                firstRow = false;
              }
            } else {
              imgForRow = imageUrl;
            }

            rows.push({
              title: finalTitle,
              style: style.name,
              color,
              size,
              price: price.toString(),
              image: imgForRow,
              description,
            });
          }
        }

        // Extra images as separate rows (with style)
        for (const extraPath of extraImagePaths) {
          rows.push({
            title: finalTitle,
            style: style.name,
            color: "",
            size: "",
            price: "",
            image: extraPath,
            description,
          });
        }
      }
    }
  }

  return rows;
}

/**
 * Self-check function for verification
 */
export function selfCheck(
  products: ProductFolder[],
  rows: CsvRow[]
): {
  case1Count: number;
  case2Count: number;
  case3Count: number;
  totalRows: number;
} {
  let case1Count = 0;
  let case2Count = 0;
  let case3Count = 0;

  for (const product of products) {
    if (product.source === "base_root_image") {
      case1Count++;
    } else if (
      product.source === "product_folder" &&
      !product.has_styles &&
      product.root_images.length > 0
    ) {
      case2Count++;
    } else if (product.has_styles) {
      case3Count++;
    }
  }

  return {
    case1Count,
    case2Count,
    case3Count,
    totalRows: rows.length,
  };
}

