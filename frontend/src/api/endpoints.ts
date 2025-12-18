// API Endpoints - Matching new BE

export const endpoints = {
  // Stores
  stores: () => '/api/v1/stores',
  store: (storeId: string) => `/api/v1/stores/${storeId}`,
  testConnection: (storeId: string) => `/api/v1/stores/${storeId}/connect`,
  setActiveStore: (storeId: string) => `/api/v1/stores/${storeId}/set-active`,
  
  // Categories
  categories: (storeId: string) => `/api/v1/stores/${storeId}/categories`,
  category: (storeId: string, categoryId: number) => `/api/v1/stores/${storeId}/categories/${categoryId}`,
  categoryProducts: (storeId: string, categoryId: number, params?: {
    page?: number;
    per_page?: number;
    status?: string;
  }) => {
    const url = `/api/v1/stores/${storeId}/categories/${categoryId}/products`;
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.per_page) searchParams.set('per_page', params.per_page.toString());
    if (params?.status) searchParams.set('status', params.status);
    const query = searchParams.toString();
    return query ? `${url}?${query}` : url;
  },
  uploadCategoryImage: (storeId: string, categoryId: number) => `/api/v1/stores/${storeId}/categories/${categoryId}/image/upload`,
  
  // Jobs
  updatePricesJob: (storeId: string) => `/api/v1/stores/${storeId}/jobs/update-prices`,
  deleteProductsJob: (storeId: string) => `/api/v1/stores/${storeId}/jobs/delete-products`,
  bulkUpdateJob: (storeId: string) => `/api/v1/stores/${storeId}/jobs/bulk-update`,
  csvImportJob: (storeId: string) => `/api/v1/stores/${storeId}/jobs/import-csv`,
  job: (storeId: string, jobId: string) => `/api/v1/stores/${storeId}/jobs/${jobId}`,
  pauseJob: (storeId: string, jobId: string) => `/api/v1/stores/${storeId}/jobs/${jobId}/pause`,
  resumeJob: (storeId: string, jobId: string) => `/api/v1/stores/${storeId}/jobs/${jobId}/resume`,
  stopJob: (storeId: string, jobId: string) => `/api/v1/stores/${storeId}/jobs/${jobId}/stop`,
  cancelJob: (storeId: string, jobId: string) => `/api/v1/stores/${storeId}/jobs/${jobId}/cancel`,
  jobEvents: (storeId: string, jobId: string) => `/api/v1/stores/${storeId}/jobs/${jobId}/events`,
  
  // Reviews
  reviewsByUrls: (storeId: string) => `/api/v1/stores/${storeId}/reviews/by-urls`,
  createReview: (storeId: string) => `/api/v1/stores/${storeId}/reviews`,
  createReviewsBatch: (storeId: string) => `/api/v1/stores/${storeId}/reviews/batch`,
  verifyReview: (storeId: string, reviewId: number) => `/api/v1/stores/${storeId}/reviews/${reviewId}/verify`,
  uploadReviewImages: (storeId: string, reviewId: number) => `/api/v1/stores/${storeId}/reviews/${reviewId}/images`,
  deleteReview: (storeId: string, reviewId: number) => `/api/v1/stores/${storeId}/reviews/${reviewId}`,
  
  // Product Editor
  productEditorByUrl: (storeId: string) => `/api/v1/stores/${storeId}/products/editor/by-url`,
  productEditor: (storeId: string, productId: number) => `/api/v1/stores/${storeId}/products/editor/${productId}`,
  updateProductEditor: (storeId: string, productId: number) => `/api/v1/stores/${storeId}/products/editor/${productId}`,
  uploadProductImages: (storeId: string, productId: number) => `/api/v1/stores/${storeId}/products/editor/${productId}/images/upload`,
};
