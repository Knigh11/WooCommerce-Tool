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
  jobEvents: (storeId: string, jobId: string, token?: string) => {
    const base = `/api/v1/stores/${storeId}/jobs/${jobId}/events`
    return token ? `${base}?token=${encodeURIComponent(token)}` : base
  },
  
  // Reviews
  reviewsByUrls: (storeId: string) => `/api/v1/stores/${storeId}/reviews/by-urls`,
  createReview: (storeId: string) => `/api/v1/stores/${storeId}/reviews`,
  createReviewsBatch: (storeId: string) => `/api/v1/stores/${storeId}/reviews/batch`,
  verifyReview: (storeId: string, reviewId: number) => `/api/v1/stores/${storeId}/reviews/${reviewId}/verify`,
  uploadReviewImages: (storeId: string, reviewId: number) => `/api/v1/stores/${storeId}/reviews/${reviewId}/images`,
  deleteReview: (storeId: string, reviewId: number) => `/api/v1/stores/${storeId}/reviews/${reviewId}`,
  
  // Images
  imageProxy: (params?: { u?: string; w?: number; h?: number }) => {
    const url = '/api/v1/img/proxy'
    const searchParams = new URLSearchParams()
    if (params?.u) searchParams.set('u', params.u)
    if (params?.w) searchParams.set('w', params.w.toString())
    if (params?.h) searchParams.set('h', params.h.toString())
    const query = searchParams.toString()
    return query ? `${url}?${query}` : url
  },
  
  // Product Editor
  productEditorByUrl: (storeId: string) => `/api/v1/stores/${storeId}/products/editor/by-url`,
  productEditor: (storeId: string, productId: number) => `/api/v1/stores/${storeId}/products/editor/${productId}`,
  updateProductEditor: (storeId: string, productId: number) => `/api/v1/stores/${storeId}/products/editor/${productId}`,
  uploadProductImages: (storeId: string, productId: number) => `/api/v1/stores/${storeId}/products/editor/${productId}/images/upload`,
  
  // BMSM (Buy More Save More) - store_id in path
  bmsmSearchProducts: (storeId: string) => `/api/v1/stores/${storeId}/bmsm/search-products`,
  bmsmProductRules: (storeId: string, productId: number) => `/api/v1/stores/${storeId}/bmsm/products/${productId}/rules`,
  bmsmUpdateProductRules: (storeId: string, productId: number) => `/api/v1/stores/${storeId}/bmsm/products/${productId}/rules`,
  bmsmDisableProductRules: (storeId: string, productId: number) => `/api/v1/stores/${storeId}/bmsm/products/${productId}/rules/disable`,
  bmsmClearProductRules: (storeId: string, productId: number) => `/api/v1/stores/${storeId}/bmsm/products/${productId}/rules`,
  bmsmInventoryAll: (storeId: string, params?: { search?: string; filter_type?: string }) => {
    const url = `/api/v1/stores/${storeId}/bmsm/inventory/all`;
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.filter_type) searchParams.set('filter_type', params.filter_type);
    const query = searchParams.toString();
    return query ? `${url}?${query}` : url;
  },
  bmsmInventory: (storeId: string) => `/api/v1/stores/${storeId}/bmsm/inventory`,
  bmsmTestConnection: (storeId: string) => `/api/v1/stores/${storeId}/bmsm/test-connection`,
  
  // FBT Combos - store_id in path
  fbtCombosAll: (storeId: string, params?: { search?: string }) => {
    const url = `/api/v1/stores/${storeId}/fbt-combos/all`;
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    const query = searchParams.toString();
    return query ? `${url}?${query}` : url;
  },
  fbtCombos: (storeId: string, params?: { search?: string; page?: number; per_page?: number }) => {
    const url = `/api/v1/stores/${storeId}/fbt-combos`;
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.per_page) searchParams.set('per_page', params.per_page.toString());
    const query = searchParams.toString();
    return query ? `${url}?${query}` : url;
  },
  fbtCombo: (storeId: string, mainId: number) => `/api/v1/stores/${storeId}/fbt-combos/${mainId}`,
  fbtCombosCreate: (storeId: string) => `/api/v1/stores/${storeId}/fbt-combos`,
  fbtCombosUpdate: (storeId: string, mainId: number) => `/api/v1/stores/${storeId}/fbt-combos/${mainId}`,
  fbtCombosDelete: (storeId: string, mainId: number) => `/api/v1/stores/${storeId}/fbt-combos/${mainId}`,
  fbtSearchProducts: (storeId: string) => `/api/v1/stores/${storeId}/fbt-combos/search-products`,
  fbtResolve: (storeId: string) => `/api/v1/stores/${storeId}/fbt-combos/resolve`,
  fbtTestConnection: (storeId: string) => `/api/v1/stores/${storeId}/fbt-combos/test-connection`,
};
