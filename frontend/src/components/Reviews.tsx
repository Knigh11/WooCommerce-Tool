/**
 * Reviews Component
 * Manage product reviews - fetch by URLs, create reviews, upload images, verify reviews
 * UI designed as Excel-like table matching desktop app
 */

import { useRef, useState } from 'react';
import { apiFetch } from '../api/client';
import { endpoints } from '../api/endpoints';

interface Review {
  id?: number;
  reviewer: string;
  reviewer_email: string;
  rating: number;
  review: string;
  status?: string;
  date_created?: string;
  images?: any[];
  has_image?: boolean;
  local_image_path?: string;
}

interface ProductWithReviews {
  url: string;
  product_id?: number;
  product_name?: string;
  permalink?: string;
  reviews?: Review[];
  error?: string;
}

interface ReviewsProps {
  storeId: string | null;
  onCreateJob?: (jobId: string) => void;
}

interface TableRow {
  type: 'product' | 'review';
  product_id?: number;
  product_name?: string;
  review?: Review;
  expanded?: boolean;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
}

function stripHtmlTags(html: string): string {
  if (!html) return '';
  const tmp = document.createElement('DIV');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

export function Reviews({ storeId, onCreateJob: _onCreateJob }: ReviewsProps) {
  const [urls, setUrls] = useState('');
  const [products, setProducts] = useState<ProductWithReviews[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Review form state
  const [selectedProduct, setSelectedProduct] = useState<ProductWithReviews | null>(null);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [reviewer, setReviewer] = useState('');
  const [reviewerEmail, setReviewerEmail] = useState('');
  const [rating, setRating] = useState<number>(5);
  const [reviewText, setReviewText] = useState('');
  const [selectedImageFiles, setSelectedImageFiles] = useState<File[]>([]);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [creatingReview, setCreatingReview] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [verifyingReview, setVerifyingReview] = useState(false);
  const [deletingReview, setDeletingReview] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedProducts, setExpandedProducts] = useState<Set<number>>(new Set());

  // Build table rows from products (Excel-like structure)
  const tableRows: TableRow[] = [];
  products.forEach((product) => {
    if (product.error) {
      tableRows.push({
        type: 'product',
        product_id: product.product_id,
        product_name: product.product_name || product.url,
        expanded: false
      });
    } else if (product.product_id) {
      const isExpanded = expandedProducts.has(product.product_id);
      tableRows.push({
        type: 'product',
        product_id: product.product_id,
        product_name: product.product_name,
        expanded: isExpanded
      });

      if (isExpanded && product.reviews) {
        product.reviews.forEach((review) => {
          tableRows.push({
            type: 'review',
            product_id: product.product_id,
            product_name: product.product_name,
            review
          });
        });
      }
    }
  });

  const handleFetchProducts = async () => {
    if (!storeId) {
      setError('Vui lòng chọn store');
      return;
    }

    const urlList = urls.split('\n').filter(u => u.trim());
    if (urlList.length === 0) {
      setError('Vui lòng nhập ít nhất một URL');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { data } = await apiFetch<{ results: ProductWithReviews[] }>(
        endpoints.reviewsByUrls(storeId),
        {
          method: 'POST',
          body: JSON.stringify({ urls: urlList }),
        }
      );
      setProducts(data.results || []);
      // Auto-expand all products
      const newExpanded = new Set<number>();
      data.results?.forEach(p => {
        if (p.product_id) newExpanded.add(p.product_id);
      });
      setExpandedProducts(newExpanded);
      setSuccess(`Đã tải ${data.results?.length || 0} sản phẩm`);
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tải sản phẩm');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleProduct = (productId: number) => {
    const newExpanded = new Set(expandedProducts);
    if (newExpanded.has(productId)) {
      newExpanded.delete(productId);
    } else {
      newExpanded.add(productId);
    }
    setExpandedProducts(newExpanded);
  };

  const handleSelectImage = () => {
    fileInputRef.current?.click();
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const fileArray = Array.from(files);
      setSelectedImageFiles(fileArray);

      // Show preview of first image
      if (fileArray.length > 0) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setImagePreview(event.target?.result as string);
        };
        reader.readAsDataURL(fileArray[0]);
      }
    }
  };

  const handleCreateReview = async () => {
    if (!storeId || !selectedProduct?.product_id) {
      setError('Không thể tạo review: thiếu product ID');
      return;
    }

    if (!reviewer.trim() || !reviewerEmail.trim() || !reviewText.trim()) {
      setError('Vui lòng điền đầy đủ thông tin review');
      return;
    }

    setCreatingReview(true);
    setError(null);
    setSuccess(null);

    try {
      // Step 1: Create review
      const request = {
        product_id: selectedProduct.product_id,
        reviewer: reviewer.trim(),
        reviewer_email: reviewerEmail.trim(),
        rating,
        review_text: reviewText.trim(),
      };

      const { data: reviewData } = await apiFetch(endpoints.createReview(storeId), {
        method: 'POST',
        body: JSON.stringify(request),
      });

      const reviewId = (reviewData as any).id;

      // Step 2: Verify review
      try {
        await apiFetch(endpoints.verifyReview(storeId, reviewId), {
          method: 'POST',
        });
      } catch (err) {
        // Verify is optional, continue even if it fails
        console.warn('Failed to verify review:', err);
      }

      // Step 3: Upload images if any
      if (selectedImageFiles.length > 0) {
        setUploadingImages(true);
        try {
          const formData = new FormData();
          selectedImageFiles.forEach(file => {
            formData.append('files', file);
          });

          const API_BASE = (import.meta as any).env?.VITE_API_BASE;
          const USE_PROXY = !API_BASE || (import.meta as any).env?.DEV;
          const url = USE_PROXY
            ? endpoints.uploadReviewImages(storeId, reviewId)
            : `${API_BASE}${endpoints.uploadReviewImages(storeId, reviewId)}`;

          const response = await fetch(url, {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error('Failed to upload images');
          }
        } catch (err: any) {
          console.warn('Failed to upload images:', err);
          // Continue even if image upload fails
        } finally {
          setUploadingImages(false);
        }
      }

      // Refresh products to show new review
      await handleFetchProducts();

      // Reset form
      setSelectedProduct(null);
      setSelectedReview(null);
      setReviewer('');
      setReviewerEmail('');
      setRating(5);
      setReviewText('');
      setSelectedImageFiles([]);
      setImagePreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      setSuccess('Đã tạo review thành công!');
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tạo review');
    } finally {
      setCreatingReview(false);
    }
  };

  const handleVerifyReview = async (reviewId: number) => {
    if (!storeId) {
      setError('Vui lòng chọn store');
      return;
    }

    setVerifyingReview(true);
    setError(null);

    try {
      await apiFetch(endpoints.verifyReview(storeId, reviewId), {
        method: 'POST',
      });
      setSuccess('Đã xác thực review thành công!');
      // Refresh to update UI
      await handleFetchProducts();
    } catch (err: any) {
      setError(err.message || 'Lỗi khi xác thực review');
    } finally {
      setVerifyingReview(false);
    }
  };

  const handleDeleteReview = async (reviewId: number) => {
    if (!storeId) {
      setError('Vui lòng chọn store');
      return;
    }

    if (!confirm('Xóa đánh giá này vĩnh viễn?\n\nĐiều này không thể hoàn tác.')) {
      return;
    }

    setDeletingReview(true);
    setError(null);

    try {
      await apiFetch(endpoints.deleteReview(storeId, reviewId), {
        method: 'DELETE',
      });
      setSuccess('Đã xóa review thành công!');
      // Refresh to update UI
      await handleFetchProducts();
    } catch (err: any) {
      setError(err.message || 'Lỗi khi xóa review');
    } finally {
      setDeletingReview(false);
    }
  };

  const handleEditReview = (product: ProductWithReviews, review: Review) => {
    setSelectedProduct(product);
    setSelectedReview(review);
    setReviewer(review.reviewer);
    setReviewerEmail(review.reviewer_email);
    setRating(review.rating);
    setReviewText(stripHtmlTags(review.review));
    setSelectedImageFiles([]);
    setImagePreview(null);
  };

  const handleAddReview = (product: ProductWithReviews) => {
    setSelectedProduct(product);
    setSelectedReview(null);
    setReviewer('');
    setReviewerEmail('');
    setRating(5);
    setReviewText('');
    setSelectedImageFiles([]);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Quản lý Đánh giá</h2>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
          {success}
        </div>
      )}

      {/* URL Input */}
      <div className="border rounded p-4">
        <h3 className="font-bold mb-4">Nhập URL sản phẩm</h3>
        <label className="block mb-2">Dán URL sản phẩm (mỗi dòng 1 URL):</label>
        <textarea
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          className="w-full border rounded p-2 font-mono text-sm"
          rows={4}
          placeholder="https://example.com/product/abc&#10;https://example.com/product/xyz"
        />
        <button
          onClick={handleFetchProducts}
          disabled={loading || !storeId}
          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? 'Đang tải...' : 'Tải sản phẩm & đánh giá'}
        </button>
      </div>

      {/* Excel-like Table */}
      {tableRows.length > 0 && (
        <div className="border rounded overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border p-2 text-left font-semibold min-w-[300px]">Tên / Mô tả</th>
                  <th className="border p-2 text-left font-semibold w-[80px]">Loại</th>
                  <th className="border p-2 text-left font-semibold min-w-[150px]">Người đánh giá</th>
                  <th className="border p-2 text-left font-semibold min-w-[200px]">Email</th>
                  <th className="border p-2 text-left font-semibold w-[80px]">Đánh giá</th>
                  <th className="border p-2 text-left font-semibold w-[80px]">Có ảnh</th>
                  <th className="border p-2 text-left font-semibold min-w-[150px]">Ngày tạo</th>
                  <th className="border p-2 text-left font-semibold w-[120px]">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, idx) => {
                  if (row.type === 'product') {
                    const product = products.find(p => p.product_id === row.product_id);

                    return (
                      <tr
                        key={`product-${row.product_id}`}
                        className="bg-gray-50 hover:bg-gray-100 cursor-pointer"
                        onClick={() => row.product_id && handleToggleProduct(row.product_id)}
                      >
                        <td className="border p-2 font-medium">
                          {row.expanded ? '▼ ' : '▶ '}
                          {row.product_name} {row.product_id && `(ID #${row.product_id})`}
                        </td>
                        <td className="border p-2">Sản phẩm</td>
                        <td className="border p-2" colSpan={5}></td>
                        <td className="border p-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (product) handleAddReview(product);
                            }}
                            className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                          >
                            + Thêm
                          </button>
                        </td>
                      </tr>
                    );
                  } else {
                    const review = row.review!;
                    const reviewTextClean = stripHtmlTags(review.review);
                    const hasImage = review.has_image || (review.images && review.images.length > 0);
                    return (
                      <tr
                        key={`review-${review.id || idx}`}
                        className="hover:bg-blue-50"
                        onClick={() => {
                          if (row.product_id && row.product_name) {
                            const product = products.find(p => p.product_id === row.product_id);
                            if (product) handleEditReview(product, review);
                          }
                        }}
                      >
                        <td className="border p-2">
                          <div className="max-w-md">
                            {review.id ? `Review #${review.id} - ${review.rating}★ - ${review.reviewer}` : 'Review (mới) - chưa gửi'}
                            {reviewTextClean && (
                              <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                                {reviewTextClean}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="border p-2">Đánh giá</td>
                        <td className="border p-2">{review.reviewer}</td>
                        <td className="border p-2">{review.reviewer_email}</td>
                        <td className="border p-2">{review.rating}</td>
                        <td className="border p-2">{hasImage ? 'Có' : 'Không'}</td>
                        <td className="border p-2">{formatDate(review.date_created)}</td>
                        <td className="border p-2">
                          <div className="flex gap-1">
                            {review.id && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (review.id) handleVerifyReview(review.id);
                                  }}
                                  disabled={verifyingReview || deletingReview}
                                  className="px-2 py-1 bg-yellow-600 text-white text-xs rounded hover:bg-yellow-700 disabled:bg-gray-400"
                                  title="Xác thực đánh giá"
                                >
                                  ✓
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (review.id) handleDeleteReview(review.id);
                                  }}
                                  disabled={verifyingReview || deletingReview}
                                  className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 disabled:bg-gray-400"
                                  title="Xóa đánh giá"
                                >
                                  ×
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Review Editor Panel */}
      {selectedProduct && !selectedProduct.error && (
        <div className="border rounded p-4 bg-blue-50">
          <h3 className="font-bold mb-4">
            {selectedReview ? 'Chỉnh sửa Review' : 'Tạo Review mới'} cho: {selectedProduct.product_name}
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Tên sản phẩm:</label>
                <input
                  type="text"
                  value={selectedProduct.product_name || ''}
                  className="w-full border rounded p-2 bg-gray-100"
                  readOnly
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Người đánh giá *:</label>
                <input
                  type="text"
                  value={reviewer}
                  onChange={(e) => setReviewer(e.target.value)}
                  className="w-full border rounded p-2"
                  placeholder="Tên người đánh giá"
                  disabled={!!selectedReview?.id}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Email *:</label>
                <input
                  type="email"
                  value={reviewerEmail}
                  onChange={(e) => setReviewerEmail(e.target.value)}
                  className="w-full border rounded p-2"
                  placeholder="email@example.com"
                  disabled={!!selectedReview?.id}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Đánh giá *:</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={rating}
                  onChange={(e) => setRating(parseInt(e.target.value) || 5)}
                  className="w-full border rounded p-2"
                  disabled={!!selectedReview?.id}
                  required
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nội dung đánh giá *:</label>
                <textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  className="w-full border rounded p-2"
                  rows={6}
                  placeholder="Viết đánh giá của bạn..."
                  disabled={!!selectedReview?.id}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Ảnh:</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImageChange}
                  disabled={!!selectedReview?.id}
                />
                <div className="flex gap-2 items-center">
                  <button
                    type="button"
                    onClick={handleSelectImage}
                    disabled={!!selectedReview?.id || uploadingImages}
                    className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 text-sm"
                  >
                    Chọn ảnh...
                  </button>
                  {selectedImageFiles.length > 0 && (
                    <span className="text-sm text-gray-600">
                      Đã chọn {selectedImageFiles.length} ảnh
                    </span>
                  )}
                </div>
                {imagePreview && (
                  <div className="mt-2">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="max-w-xs max-h-32 object-contain border rounded"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            {!selectedReview?.id && (
              <button
                onClick={handleCreateReview}
                disabled={creatingReview || uploadingImages || !storeId}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
              >
                {creatingReview || uploadingImages ? 'Đang xử lý...' : 'Gửi đánh giá mới'}
              </button>
            )}
            <button
              onClick={() => {
                setSelectedProduct(null);
                setSelectedReview(null);
                setReviewer('');
                setReviewerEmail('');
                setRating(5);
                setReviewText('');
                setSelectedImageFiles([]);
                setImagePreview(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }}
              className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500"
            >
              Hủy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
