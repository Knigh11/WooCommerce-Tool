import { useRef, useState, useEffect } from 'react';
import { apiFetch } from '../api/client';
import { endpoints } from '../api/endpoints';
import { EditableAttribute, EditableImage, EditableProduct, EditableVariation, ProductUpdateRequest } from '../api/types';

interface ProductEditorProps {
  storeId: string | null;
  initialUrl?: string;
  initialId?: number;
}

// Helper functions for attribute inference and matching
function normalizeTextForMatching(text: string): string {
  if (!text) return '';
  // Remove accents and normalize
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .trim();
}

function findAttributeBySlug(product: EditableProduct, slug: string): EditableAttribute | null {
  return product.attributes.find(attr => attr.slug === slug) || null;
}

function inferAttributeKeys(product: EditableProduct): { size: string | null; color: string | null; style: string | null } {
  const result = { size: null as string | null, color: null as string | null, style: null as string | null };

  for (const attr of product.attributes) {
    const slugNorm = normalizeTextForMatching(attr.slug);
    const nameNorm = normalizeTextForMatching(attr.name);

    if (slugNorm === 'pa_size' || slugNorm === 'size' || nameNorm === 'size' || nameNorm === 'kich_co') {
      result.size = attr.slug;
    } else if (slugNorm === 'pa_color' || slugNorm === 'color' || nameNorm === 'color' || nameNorm === 'mau') {
      result.color = attr.slug;
    } else if (slugNorm === 'pa_style' || slugNorm === 'style' || nameNorm === 'style' || nameNorm === 'kieu') {
      result.style = attr.slug;
    }
  }

  return result;
}

function normalizeSize(value: string): string {
  if (!value) return '';
  return value.toLowerCase().trim();
}

function abbrColor(text: string, maxLen: number = 6): string {
  if (!text) return '';
  const tokens = text.trim().split(/[\s\-_]+/);
  const abbr = tokens.map(t => t[0]?.toUpperCase() || '').join('');
  return abbr.length > maxLen ? abbr.substring(0, maxLen) : abbr;
}

function sanitizeToken(text: string, maxLen: number = 20): string {
  if (!text) return '';
  let sanitized = text.toUpperCase().trim();
  sanitized = sanitized.replace(/[^A-Z0-9]/g, '-');
  sanitized = sanitized.replace(/-+/g, '-');
  sanitized = sanitized.replace(/^-|-$/g, '');
  return sanitized.length > maxLen ? sanitized.substring(0, maxLen) : sanitized;
}

const SIZE_ORDER = ['s', 'm', 'l', 'xl', '2xl', '3xl', '4xl', '5xl'];

function generateVariationSku(
  productId: number,
  sizeValue: string,
  colorValue: string,
  existingSkus: Set<string>
): string {
  if (!sizeValue || !colorValue) return '';

  const sizeNorm = normalizeSize(sizeValue);
  const sizeToken = SIZE_ORDER.includes(sizeNorm) ? sizeNorm.toUpperCase() : sanitizeToken(sizeValue, 10);
  const colorToken = abbrColor(colorValue, 6);

  if (!sizeToken || !colorToken) return '';

  const baseSku = `${productId}-${sizeToken}-${colorToken}`.toUpperCase();

  if (!existingSkus.has(baseSku)) {
    return baseSku;
  }

  // Handle collision
  let suffix = 2;
  while (suffix <= 999) {
    const candidate = `${baseSku}-${suffix}`;
    if (!existingSkus.has(candidate)) {
      return candidate;
    }
    suffix++;
  }

  return baseSku;
}

export function ProductEditor({ storeId, initialUrl, initialId }: ProductEditorProps) {
  const [productUrl, setProductUrl] = useState(initialUrl || '');
  const [product, setProduct] = useState<EditableProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [originalImageIds, setOriginalImageIds] = useState<Set<number>>(new Set());
  const [sessionUploadedIds, setSessionUploadedIds] = useState<Set<number>>(new Set());
  const [uploadingImages, setUploadingImages] = useState(false);
  const [positionInput, setPositionInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Attribute management state
  const [selectedAttributeIndex, setSelectedAttributeIndex] = useState<number | null>(null);
  const [showAddAttributeDialog, setShowAddAttributeDialog] = useState(false);
  const [showEditAttributeDialog, setShowEditAttributeDialog] = useState(false);

  // Variation management state
  const [showAddVariationDialog, setShowAddVariationDialog] = useState(false);

  const handleFetch = async () => {
    if (!storeId || !productUrl.trim()) {
      setError('Vui lòng nhập URL sản phẩm');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { data } = await apiFetch<EditableProduct>(
        `${endpoints.productEditorByUrl(storeId)}?url=${encodeURIComponent(productUrl.trim())}`
      );
      setProduct(data);
      // Track original image IDs
      const originalIds = new Set(data.images.filter(img => img.id).map(img => img.id!));
      setOriginalImageIds(originalIds);
      setSessionUploadedIds(new Set());
      setSelectedImageIndex(null);
      setSuccess('Đã tải sản phẩm thành công');
    } catch (err: any) {
      setError(`Lỗi khi tải sản phẩm: ${err.message}`);
      setProduct(null);
    } finally {
      setLoading(false);
    }
  };

  // Fetch by ID when initialId is provided
  useEffect(() => {
    if (initialId && storeId) {
      setLoading(true);
      setError(null);
      setSuccess(null);
      apiFetch<EditableProduct>(endpoints.productEditor(storeId, initialId))
        .then(({ data }) => {
          setProduct(data);
          const originalIds = new Set(data.images.filter(img => img.id).map(img => img.id!));
          setOriginalImageIds(originalIds);
          setSessionUploadedIds(new Set());
          setSelectedImageIndex(null);
          setSuccess('Đã tải sản phẩm thành công');
        })
        .catch((err: any) => {
          setError(`Lỗi khi tải sản phẩm: ${err.message}`);
          setProduct(null);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [initialId, storeId]);

  const handleSave = async () => {
    if (!storeId || !product) {
      setError('Chưa có sản phẩm để lưu');
      return;
    }

    if (!confirm('Lưu thay đổi lên store?')) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updateRequest: ProductUpdateRequest = {
        name: product.name,
        short_description: product.short_description,
        description: product.description,
        attributes: product.attributes,
        images: product.images.filter(img => !img.delete_from_media),
        variations: product.variations, // Include all variations, backend will handle deletion based on status
        images_to_delete_media_ids: product.images_to_delete_media_ids || []
      };

      await apiFetch(
        endpoints.updateProductEditor(storeId, product.id),
        {
          method: 'PUT',
          body: JSON.stringify(updateRequest),
        }
      );

      setSuccess('Đã lưu sản phẩm thành công');

      // Reload product after save
      const { data: freshProduct } = await apiFetch<EditableProduct>(
        endpoints.productEditor(storeId, product.id)
      );
      setProduct(freshProduct);
      // Reset tracking
      const originalIds = new Set(freshProduct.images.filter(img => img.id).map(img => img.id!));
      setOriginalImageIds(originalIds);
      setSessionUploadedIds(new Set());
      setSelectedImageIndex(null);
    } catch (err: any) {
      setError(`Lỗi khi lưu: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const updateProductField = (field: keyof EditableProduct, value: any) => {
    if (!product) return;
    setProduct({ ...product, [field]: value });
  };


  const updateVariation = (index: number, updates: Partial<EditableProduct['variations'][0]>) => {
    if (!product) return;
    const newVariations = [...product.variations];
    newVariations[index] = { ...newVariations[index], ...updates };
    setProduct({ ...product, variations: newVariations });
  };

  const deleteVariation = (index: number) => {
    if (!product) return;
    const newVariations = [...product.variations];
    if (newVariations[index].id) {
      newVariations[index].status = 'to_delete';
    } else {
      newVariations.splice(index, 1);
    }
    setProduct({ ...product, variations: newVariations });
  };

  // Attribute management functions
  const handleAddAttribute = (name: string, slug: string, options: string[]) => {
    if (!product) return;

    // Check if attribute with this slug already exists
    const existingAttr = product.attributes.find(attr => attr.slug === slug);

    if (existingAttr) {
      // Merge options (case-insensitive, no duplicates)
      const existingOptionsLower = new Set(existingAttr.options.map(opt => normalizeTextForMatching(opt)));
      const mergedOptions = [...existingAttr.options];

      for (const newOpt of options) {
        if (newOpt.trim() && !existingOptionsLower.has(normalizeTextForMatching(newOpt.trim()))) {
          mergedOptions.push(newOpt.trim());
          existingOptionsLower.add(normalizeTextForMatching(newOpt.trim()));
        }
      }

      existingAttr.options = mergedOptions;
      setProduct({ ...product });
      setSuccess(`Đã cập nhật thuộc tính '${name}' (${slug}): thêm ${options.length} option(s) mới`);
    } else {
      // Create new attribute
      const newAttr: EditableAttribute = {
        name,
        slug,
        options: options.filter(opt => opt.trim()),
        original_data: null
      };
      setProduct({ ...product, attributes: [...product.attributes, newAttr] });
      setSuccess(`Đã thêm thuộc tính mới: ${name} (${slug})`);
    }

    setShowAddAttributeDialog(false);
  };

  const handleEditAttribute = (index: number, name: string, slug: string, options: string[]) => {
    if (!product || index < 0 || index >= product.attributes.length) return;

    const attr = product.attributes[index];
    const oldSlug = attr.slug;

    // Update attribute
    attr.name = name;
    if (!attr.original_data) {
      // Only allow slug change for custom attributes
      attr.slug = slug;
    }
    attr.options = options.filter(opt => opt.trim());

    // If slug changed and it's a custom attribute, remap in variations
    if (oldSlug !== slug && !attr.original_data) {
      for (const var_ of product.variations) {
        if (oldSlug in var_.attributes) {
          var_.attributes[slug] = var_.attributes[oldSlug];
          delete var_.attributes[oldSlug];
        }
      }
    }

    setProduct({ ...product });
    setShowEditAttributeDialog(false);
    setSelectedAttributeIndex(null);
    setSuccess(`Đã cập nhật thuộc tính: ${name} (${slug})`);
  };

  const handleDeleteAttribute = (index: number) => {
    if (!product || index < 0 || index >= product.attributes.length) return;

    const attr = product.attributes[index];
    const attrSlug = attr.slug;

    // Mark variations with this attribute as "to_delete"
    for (const var_ of product.variations) {
      if (attrSlug in var_.attributes) {
        if (var_.id) {
          var_.status = 'to_delete';
        } else {
          // New variation: remove directly
          const varIndex = product.variations.indexOf(var_);
          product.variations.splice(varIndex, 1);
        }
      }
    }

    // Remove attribute
    const newAttributes = [...product.attributes];
    newAttributes.splice(index, 1);
    setProduct({ ...product, attributes: newAttributes });
    setSelectedAttributeIndex(null);
    setSuccess(`Đã xóa thuộc tính: ${attr.name}`);
  };

  const handleAddVariation = (sizeValue: string, colorValue: string, styleValue: string | null) => {
    if (!product) return;

    const attrKeys = inferAttributeKeys(product);
    const sizeKey = attrKeys.size;
    const colorKey = attrKeys.color;
    const styleKey = attrKeys.style;

    if (!sizeKey || !colorKey) {
      setError('Sản phẩm thiếu thuộc tính Size hoặc Color');
      return;
    }

    // Find attribute objects
    const sizeAttr = findAttributeBySlug(product, sizeKey);
    const colorAttr = findAttributeBySlug(product, colorKey);
    const styleAttr = styleKey ? findAttributeBySlug(product, styleKey) : null;

    if (!sizeAttr || !colorAttr) {
      setError('Không tìm thấy thuộc tính Size hoặc Color');
      return;
    }

    // Check if options are new and add to attributes
    if (sizeValue && !sizeAttr.options.some(opt => normalizeTextForMatching(opt) === normalizeTextForMatching(sizeValue))) {
      sizeAttr.options.push(sizeValue);
    }
    if (colorValue && !colorAttr.options.some(opt => normalizeTextForMatching(opt) === normalizeTextForMatching(colorValue))) {
      colorAttr.options.push(colorValue);
    }
    if (styleAttr && styleValue && !styleAttr.options.some(opt => normalizeTextForMatching(opt) === normalizeTextForMatching(styleValue))) {
      styleAttr.options.push(styleValue);
    }

    // Build attributes dict
    const attrsDict: Record<string, string> = {
      [sizeKey]: sizeValue,
      [colorKey]: colorValue
    };
    if (styleKey && styleValue) {
      attrsDict[styleKey] = styleValue;
    }

    // Generate SKU
    const existingSkus = new Set(product.variations.map(v => v.sku?.toUpperCase() || '').filter(s => s));
    const generatedSku = generateVariationSku(product.id, sizeValue, colorValue, existingSkus);

    // Create new variation
    const newVariation: EditableVariation = {
      id: null,
      sku: generatedSku,
      attributes: attrsDict,
      regular_price: '',
      sale_price: '',
      image_id: null,
      image_src: null,
      status: 'new'
    };

    setProduct({ ...product, variations: [...product.variations, newVariation] });
    setShowAddVariationDialog(false);
    setSuccess(`Đã thêm biến thể mới: ${sizeValue} / ${colorValue}${styleValue ? ` / ${styleValue}` : ''} (SKU: ${generatedSku})`);
  };

  // Image management functions
  const getValidImages = (): EditableImage[] => {
    if (!product) return [];
    return product.images.filter(img => !img.delete_from_media);
  };

  const reindexImagePositions = (images: EditableImage[]) => {
    const validImages = images.filter(img => !img.delete_from_media);
    validImages.forEach((img, idx) => {
      img.position = idx;
    });
  };

  const handleImageClick = (index: number) => {
    const validImages = getValidImages();
    if (index < 0 || index >= validImages.length) return;
    setSelectedImageIndex(selectedImageIndex === index ? null : index);
  };

  const handleImageUpload = async (files: FileList | null) => {
    if (!storeId || !product || !files || files.length === 0) return;

    setUploadingImages(true);
    setError(null);

    try {
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('files', file);
      });

      const API_BASE = (import.meta as any).env?.VITE_API_BASE;
      const USE_PROXY = !API_BASE || (import.meta as any).env?.DEV;
      const url = USE_PROXY
        ? endpoints.uploadProductImages(storeId, product.id)
        : `${API_BASE}${endpoints.uploadProductImages(storeId, product.id)}`;

      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Upload failed');
      }

      const uploadedImages: EditableImage[] = await response.json();

      // Add uploaded images to product
      const currentMaxPosition = product.images.length > 0
        ? Math.max(...product.images.map(img => img.position || 0))
        : -1;

      uploadedImages.forEach((img, idx) => {
        img.position = currentMaxPosition + 1 + idx;
        if (img.id) {
          setSessionUploadedIds(prev => new Set([...prev, img.id!]));
        }
      });

      setProduct({
        ...product,
        images: [...product.images, ...uploadedImages]
      });

      setSuccess(`Đã upload ${uploadedImages.length} ảnh thành công`);
    } catch (err: any) {
      setError(`Lỗi khi upload ảnh: ${err.message}`);
    } finally {
      setUploadingImages(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const moveImageUp = () => {
    if (!product || selectedImageIndex === null) {
      setError('Chưa chọn ảnh');
      return;
    }

    const validImages = getValidImages();
    if (selectedImageIndex <= 0) {
      setError('Ảnh đang ở vị trí đầu');
      return;
    }

    const currentImg = validImages[selectedImageIndex];
    const prevImg = validImages[selectedImageIndex - 1];

    // Swap in full images array
    const images = [...product.images];
    const currentIdx = images.indexOf(currentImg);
    const prevIdx = images.indexOf(prevImg);
    [images[currentIdx], images[prevIdx]] = [images[prevIdx], images[currentIdx]];

    reindexImagePositions(images);
    setProduct({ ...product, images });
    setSelectedImageIndex(selectedImageIndex - 1);
    setSuccess('Đã chuyển ảnh lên');
  };

  const moveImageDown = () => {
    if (!product || selectedImageIndex === null) {
      setError('Chưa chọn ảnh');
      return;
    }

    const validImages = getValidImages();
    if (selectedImageIndex >= validImages.length - 1) {
      setError('Ảnh đang ở vị trí cuối');
      return;
    }

    const currentImg = validImages[selectedImageIndex];
    const nextImg = validImages[selectedImageIndex + 1];

    // Swap in full images array
    const images = [...product.images];
    const currentIdx = images.indexOf(currentImg);
    const nextIdx = images.indexOf(nextImg);
    [images[currentIdx], images[nextIdx]] = [images[nextIdx], images[currentIdx]];

    reindexImagePositions(images);
    setProduct({ ...product, images });
    setSelectedImageIndex(selectedImageIndex + 1);
    setSuccess('Đã chuyển ảnh xuống');
  };

  const moveImageToPosition = () => {
    if (!product || selectedImageIndex === null) {
      setError('Chưa chọn ảnh');
      return;
    }

    const validImages = getValidImages();
    const targetPos = parseInt(positionInput.trim());

    if (isNaN(targetPos) || targetPos < 1 || targetPos > validImages.length) {
      setError(`Vị trí không hợp lệ (1-${validImages.length})`);
      return;
    }

    if (targetPos === selectedImageIndex + 1) {
      return; // Already at target position
    }

    const currentImg = validImages[selectedImageIndex];
    const targetIdx = targetPos - 1; // Convert to 0-based

    // Remove from current position
    const images = [...product.images];
    const currentIdx = images.indexOf(currentImg);
    images.splice(currentIdx, 1);

    // Insert at target position
    const validAfterRemoval = images.filter(img => !img.delete_from_media);
    const insertIdx = targetIdx > selectedImageIndex
      ? images.indexOf(validAfterRemoval[targetIdx - 1]) + 1
      : images.indexOf(validAfterRemoval[targetIdx]);

    images.splice(insertIdx, 0, currentImg);

    reindexImagePositions(images);
    setProduct({ ...product, images });
    setSelectedImageIndex(targetIdx);
    setPositionInput('');
    setSuccess(`Đã chuyển ảnh tới vị trí ${targetPos}`);
  };

  const setMainImage = () => {
    if (!product || selectedImageIndex === null) {
      setError('Chưa chọn ảnh');
      return;
    }

    const validImages = getValidImages();
    if (selectedImageIndex === 0) {
      setError('Ảnh đã là ảnh chính');
      return;
    }

    const selectedImg = validImages[selectedImageIndex];
    const images = [...product.images];
    const selectedIdx = images.indexOf(selectedImg);

    // Remove from current position
    images.splice(selectedIdx, 1);
    // Insert at beginning
    images.unshift(selectedImg);

    reindexImagePositions(images);
    setProduct({ ...product, images });
    setSelectedImageIndex(0);
    setSuccess('Đã đặt làm ảnh chính');
  };

  const deleteImage = () => {
    if (!product || selectedImageIndex === null) {
      setError('Chưa chọn ảnh');
      return;
    }

    const validImages = getValidImages();
    const img = validImages[selectedImageIndex];

    if (img.id) {
      const isSessionUpload = sessionUploadedIds.has(img.id);
      const isOriginal = originalImageIds.has(img.id);

      if (isSessionUpload && !isOriginal) {
        // Session upload: remove immediately
        const images = product.images.filter(i => i !== img);
        setProduct({ ...product, images });
        setSessionUploadedIds(prev => {
          const next = new Set(prev);
          next.delete(img.id!);
          return next;
        });
      } else {
        // Original image: mark for deletion
        img.delete_from_media = true;
        const deleteIds = product.images_to_delete_media_ids || [];
        if (!deleteIds.includes(img.id)) {
          setProduct({
            ...product,
            images_to_delete_media_ids: [...deleteIds, img.id]
          });
        } else {
          setProduct({ ...product });
        }
      }
    } else {
      // No ID: remove from array
      const images = product.images.filter(i => i !== img);
      setProduct({ ...product, images });
    }

    // Adjust selection
    const newValidImages = getValidImages();
    if (newValidImages.length === 0) {
      setSelectedImageIndex(null);
    } else if (selectedImageIndex >= newValidImages.length) {
      setSelectedImageIndex(newValidImages.length - 1);
    }

    setSuccess('Đã xóa ảnh');
  };

  return (
    <div className="border rounded p-4">
      <h3 className="text-lg font-bold mb-4">Chỉnh sửa chi tiết sản phẩm</h3>

      {/* Fetch Product Section */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">URL sản phẩm:</label>
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 p-2 border rounded"
            value={productUrl}
            onChange={(e) => setProductUrl(e.target.value)}
            placeholder="https://store.com/product/slug/"
            disabled={loading}
          />
          <button
            onClick={handleFetch}
            disabled={loading || !storeId}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Đang tải...' : 'Lấy dữ liệu'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
          {success}
        </div>
      )}

      {/* Product Editor Form */}
      {product && (
        <div className="space-y-6">
          {/* Basic Info */}
          <div>
            <label className="block text-sm font-medium mb-2">Tên sản phẩm:</label>
            <input
              type="text"
              className="w-full p-2 border rounded"
              value={product.name}
              onChange={(e) => updateProductField('name', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Mô tả ngắn:</label>
            <textarea
              className="w-full p-2 border rounded"
              rows={4}
              value={product.short_description}
              onChange={(e) => updateProductField('short_description', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Mô tả chi tiết:</label>
            <textarea
              className="w-full p-2 border rounded"
              rows={8}
              value={product.description}
              onChange={(e) => updateProductField('description', e.target.value)}
            />
          </div>

          {/* Attributes */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-md font-semibold">Thuộc tính:</h4>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddAttributeDialog(true)}
                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                >
                  Thêm thuộc tính
                </button>
                <button
                  onClick={() => {
                    if (selectedAttributeIndex !== null) {
                      setShowEditAttributeDialog(true);
                    } else {
                      setError('Chọn thuộc tính cần sửa');
                    }
                  }}
                  disabled={selectedAttributeIndex === null}
                  className="px-3 py-1 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700 disabled:bg-gray-400"
                >
                  Sửa thuộc tính
                </button>
                <button
                  onClick={() => {
                    if (selectedAttributeIndex !== null) {
                      if (confirm('Xóa thuộc tính này? Tất cả biến thể có thuộc tính này sẽ bị đánh dấu xóa.')) {
                        handleDeleteAttribute(selectedAttributeIndex);
                      }
                    } else {
                      setError('Chọn thuộc tính cần xóa');
                    }
                  }}
                  disabled={selectedAttributeIndex === null}
                  className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:bg-gray-400"
                >
                  Xóa thuộc tính
                </button>
              </div>
            </div>
            <div className="border rounded p-3 space-y-2 max-h-60 overflow-y-auto">
              {product.attributes.map((attr, idx) => (
                <div
                  key={idx}
                  onClick={() => setSelectedAttributeIndex(selectedAttributeIndex === idx ? null : idx)}
                  className={`border-b pb-2 cursor-pointer p-2 rounded ${selectedAttributeIndex === idx ? 'bg-blue-100 border-blue-400' : 'hover:bg-gray-50'
                    }`}
                >
                  <div className="font-medium">{attr.name} ({attr.slug})</div>
                  <div className="text-sm text-gray-600">
                    Options: {attr.options.slice(0, 3).join(', ')}
                    {attr.options.length > 3 && ` ... (+${attr.options.length - 3})`}
                  </div>
                </div>
              ))}
              {product.attributes.length === 0 && (
                <div className="text-center text-gray-500 py-4">
                  Chưa có thuộc tính nào. Nhấn "Thêm thuộc tính" để thêm.
                </div>
              )}
            </div>
          </div>

          {/* Images */}
          <div>
            <h4 className="text-md font-semibold mb-2">Hình ảnh:</h4>

            {/* Image Action Buttons */}
            <div className="flex flex-wrap gap-2 mb-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleImageUpload(e.target.files)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImages || !storeId}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 text-sm"
              >
                {uploadingImages ? 'Đang upload...' : 'Thêm ảnh phụ từ máy'}
              </button>
              <button
                onClick={setMainImage}
                disabled={selectedImageIndex === null || selectedImageIndex === 0}
                className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:bg-gray-400 text-sm"
              >
                Đặt làm ảnh chính
              </button>
              <button
                onClick={deleteImage}
                disabled={selectedImageIndex === null}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 text-sm"
              >
                Xoá ảnh
              </button>
              <div className="border-l border-gray-300 pl-2 flex items-center gap-2">
                <button
                  onClick={moveImageUp}
                  disabled={selectedImageIndex === null || selectedImageIndex === 0}
                  className="px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-400 text-sm"
                >
                  ⬆ Lên
                </button>
                <button
                  onClick={moveImageDown}
                  disabled={selectedImageIndex === null || getValidImages().length <= 1 || selectedImageIndex === getValidImages().length - 1}
                  className="px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-400 text-sm"
                >
                  ⬇ Xuống
                </button>
                <label className="text-sm">Vị trí:</label>
                <input
                  type="number"
                  min="1"
                  max={getValidImages().length}
                  value={positionInput}
                  onChange={(e) => setPositionInput(e.target.value)}
                  className="w-16 px-2 py-1 border rounded text-sm"
                  placeholder="1"
                />
                <button
                  onClick={moveImageToPosition}
                  disabled={selectedImageIndex === null || !positionInput}
                  className="px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-400 text-sm"
                >
                  Chuyển
                </button>
              </div>
            </div>

            {/* Image Gallery */}
            <div className="grid grid-cols-6 gap-4">
              {getValidImages().map((img, idx) => {
                const isSelected = selectedImageIndex === idx;
                const isMain = img.position === 0;

                return (
                  <div
                    key={img.id || idx}
                    onClick={() => handleImageClick(idx)}
                    className={`
                      border-2 rounded p-2 cursor-pointer transition-all
                      ${isSelected ? 'border-green-500 shadow-lg' : 'border-gray-300'}
                      hover:border-blue-400
                    `}
                  >
                    <div className="relative">
                      <img
                        src={img.src}
                        alt={img.alt}
                        className="w-full h-32 object-cover rounded"
                      />
                      {isMain && (
                        <div className="absolute top-1 left-1 bg-yellow-500 text-white text-xs px-2 py-1 rounded font-bold">
                          [Ảnh chính]
                        </div>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-center">
                      <div className="font-medium text-gray-700">
                        Vị trí: {img.position + 1}
                      </div>
                      <div className="text-gray-500 truncate mt-1">
                        {img.alt || 'No alt'}
                      </div>
                    </div>
                  </div>
                );
              })}
              {getValidImages().length === 0 && (
                <div className="col-span-6 text-center text-gray-500 py-8">
                  Chưa có ảnh nào. Nhấn "Thêm ảnh phụ từ máy" để upload.
                </div>
              )}
            </div>
          </div>

          {/* Variations */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-md font-semibold">
                Biến thể ({product.variations.filter(v => v.status !== 'to_delete').length}):
              </h4>
              <button
                onClick={() => setShowAddVariationDialog(true)}
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                Thêm biến thể
              </button>
            </div>
            {product.variations.filter(v => v.status !== 'to_delete').length > 0 ? (
              <div className="border rounded p-3 space-y-2 max-h-96 overflow-y-auto">
                {product.variations.map((variation, idx) => {
                  if (variation.status === 'to_delete') return null;

                  return (
                    <div key={idx} className="border-b pb-2">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-medium">
                            ID: {variation.id || 'New'} | SKU: {variation.sku || 'N/A'}
                            {variation.status && variation.status !== 'existing' && (
                              <span className={`ml-2 px-2 py-1 text-xs rounded ${variation.status === 'new' ? 'bg-green-100 text-green-800' :
                                variation.status === 'modified' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                {variation.status === 'new' ? 'Mới' :
                                  variation.status === 'modified' ? 'Đã sửa' : 'Xóa'}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600">
                            Attributes: {JSON.stringify(variation.attributes)}
                          </div>
                          <div className="text-sm">
                            Giá gốc: {variation.regular_price || 'N/A'} |
                            Giá giảm: {variation.sale_price || 'N/A'}
                          </div>
                        </div>
                        <button
                          onClick={() => deleteVariation(idx)}
                          className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                        >
                          Xóa
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Regular Price"
                          className="p-1 border rounded text-sm"
                          value={variation.regular_price}
                          onChange={(e) => {
                            updateVariation(idx, { regular_price: e.target.value });
                            if (variation.status === 'existing') {
                              updateVariation(idx, { status: 'modified' });
                            }
                          }}
                        />
                        <input
                          type="text"
                          placeholder="Sale Price"
                          className="p-1 border rounded text-sm"
                          value={variation.sale_price}
                          onChange={(e) => {
                            updateVariation(idx, { sale_price: e.target.value });
                            if (variation.status === 'existing') {
                              updateVariation(idx, { status: 'modified' });
                            }
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="border rounded p-3 text-center text-gray-500 py-8">
                Chưa có biến thể nào. Nhấn "Thêm biến thể" để thêm.
              </div>
            )}
          </div>

          {/* Save Button */}
          <div className="flex justify-end gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !storeId}
              className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
            >
              {saving ? 'Đang lưu...' : 'Lưu lên store'}
            </button>
          </div>
        </div>
      )}

      {/* Add Attribute Dialog */}
      {showAddAttributeDialog && (
        <AttributeDialog
          mode="add"
          onClose={() => setShowAddAttributeDialog(false)}
          onSave={handleAddAttribute}
        />
      )}

      {/* Edit Attribute Dialog */}
      {showEditAttributeDialog && selectedAttributeIndex !== null && product && (
        <AttributeDialog
          mode="edit"
          attribute={product.attributes[selectedAttributeIndex]}
          onClose={() => {
            setShowEditAttributeDialog(false);
            setSelectedAttributeIndex(null);
          }}
          onSave={(name, slug, options) => {
            handleEditAttribute(selectedAttributeIndex, name, slug, options);
          }}
        />
      )}

      {/* Add Variation Dialog */}
      {showAddVariationDialog && product && (
        <AddVariationDialog
          product={product}
          onClose={() => setShowAddVariationDialog(false)}
          onSave={handleAddVariation}
        />
      )}
    </div>
  );
}

// Attribute Dialog Component
interface AttributeDialogProps {
  mode: 'add' | 'edit';
  attribute?: EditableAttribute;
  onClose: () => void;
  onSave: (name: string, slug: string, options: string[]) => void;
}

function AttributeDialog({ mode, attribute, onClose, onSave }: AttributeDialogProps) {
  const [name, setName] = useState(attribute?.name || '');
  const [slug, setSlug] = useState(attribute?.slug || '');
  const [options, setOptions] = useState(attribute?.options.join('\n') || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert('Tên thuộc tính không được để trống');
      return;
    }

    if (mode === 'add' && !slug.trim()) {
      alert('Slug không được để trống');
      return;
    }

    const optionsList = options.split('\n').map(opt => opt.trim()).filter(opt => opt);
    onSave(name.trim(), slug.trim(), optionsList);
  };

  const isSlugDisabled = mode === 'edit' && attribute?.original_data !== null && attribute?.original_data !== undefined;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-bold mb-4">
          {mode === 'add' ? 'Thêm thuộc tính' : 'Sửa thuộc tính'}
        </h3>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Tên:</label>
            <input
              type="text"
              className="w-full p-2 border rounded"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Slug (pa_style, pa_size, etc.):
            </label>
            <input
              type="text"
              className="w-full p-2 border rounded"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={isSlugDisabled}
              required={mode === 'add'}
            />
            {isSlugDisabled && (
              <p className="text-xs text-gray-500 mt-1">
                Thuộc tính có sẵn từ WooCommerce, không sửa slug/ID.
              </p>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Options (mỗi dòng 1 option):</label>
            <textarea
              className="w-full p-2 border rounded"
              rows={6}
              value={options}
              onChange={(e) => setOptions(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              OK
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Add Variation Dialog Component
interface AddVariationDialogProps {
  product: EditableProduct;
  onClose: () => void;
  onSave: (size: string, color: string, style: string | null) => void;
}

function AddVariationDialog({ product, onClose, onSave }: AddVariationDialogProps) {
  const attrKeys = inferAttributeKeys(product);
  const sizeKey = attrKeys.size;
  const colorKey = attrKeys.color;
  const styleKey = attrKeys.style;

  const sizeAttr = sizeKey ? findAttributeBySlug(product, sizeKey) : null;
  const colorAttr = colorKey ? findAttributeBySlug(product, colorKey) : null;
  const styleAttr = styleKey ? findAttributeBySlug(product, styleKey) : null;

  const [sizeValue, setSizeValue] = useState('');
  const [colorValue, setColorValue] = useState('');
  const [styleValue, setStyleValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!sizeValue.trim()) {
      alert(`${sizeAttr?.name || 'Size'} là bắt buộc`);
      return;
    }

    if (!colorValue.trim()) {
      alert(`${colorAttr?.name || 'Color'} là bắt buộc`);
      return;
    }

    onSave(sizeValue.trim(), colorValue.trim(), styleValue.trim() || null);
  };

  if (!sizeKey || !colorKey) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-md">
          <h3 className="text-lg font-bold mb-4">Lỗi</h3>
          <p className="mb-4">
            Sản phẩm thiếu thuộc tính biến thể: {!sizeKey && 'Size'} {!colorKey && 'Color'}.
            Vui lòng thêm thuộc tính này trong tab Thuộc tính trước.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
          >
            Đóng
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-bold mb-4">Thêm biến thể</h3>

        <form onSubmit={handleSubmit}>
          {sizeAttr && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">
                {sizeAttr.name} *:
              </label>
              <input
                type="text"
                list={`size-options-${sizeAttr.slug}`}
                className="w-full p-2 border rounded"
                value={sizeValue}
                onChange={(e) => setSizeValue(e.target.value)}
                placeholder={`Chọn hoặc nhập ${sizeAttr.name}`}
                required
              />
              <datalist id={`size-options-${sizeAttr.slug}`}>
                {sizeAttr.options.map((opt, idx) => (
                  <option key={idx} value={opt} />
                ))}
              </datalist>
            </div>
          )}

          {colorAttr && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">
                {colorAttr.name} *:
              </label>
              <input
                type="text"
                list={`color-options-${colorAttr.slug}`}
                className="w-full p-2 border rounded"
                value={colorValue}
                onChange={(e) => setColorValue(e.target.value)}
                placeholder={`Chọn hoặc nhập ${colorAttr.name}`}
                required
              />
              <datalist id={`color-options-${colorAttr.slug}`}>
                {colorAttr.options.map((opt, idx) => (
                  <option key={idx} value={opt} />
                ))}
              </datalist>
            </div>
          )}

          {styleAttr && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">
                {styleAttr.name}:
              </label>
              <input
                type="text"
                list={`style-options-${styleAttr.slug}`}
                className="w-full p-2 border rounded"
                value={styleValue}
                onChange={(e) => setStyleValue(e.target.value)}
                placeholder={`Chọn hoặc nhập ${styleAttr.name} (tùy chọn)`}
              />
              <datalist id={`style-options-${styleAttr.slug}`}>
                {styleAttr.options.map((opt, idx) => (
                  <option key={idx} value={opt} />
                ))}
              </datalist>
            </div>
          )}

          <p className="text-xs text-gray-500 mb-4">* Bắt buộc</p>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              OK
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
