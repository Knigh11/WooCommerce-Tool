// API Types - Matching new BE schema

export interface StoreSummary {
  is_active: any;
  id: string;
  name: string;
  store_url: string;
  has_wc_keys: boolean;
  has_wp_creds: boolean;
}

export interface StoreDetail {
  id: string;
  name: string;
  store_url: string;
  has_wc_keys: boolean;
  has_wp_creds: boolean;
  is_active: boolean;
}

export interface StoreCreateRequest {
  name: string;
  store_url: string;
  consumer_key: string;
  consumer_secret: string;
  wp_username?: string;
  wp_app_password?: string;
  set_as_active?: boolean;
}

export interface StoreUpdateRequest {
  name?: string;
  store_url?: string;
  consumer_key?: string;
  consumer_secret?: string;
  wp_username?: string;
  wp_app_password?: string;
}

export interface ConnectionTestResponse {
  success: boolean;
  message: string;
  woocommerce: { ok: boolean; message: string };
  wordpress: { ok: boolean; message: string };
}

export interface CategoryNode {
  id: number;
  name: string;
  parent: number;
  count: number;
  level: number;
  full_path: string;
  image_id?: number | null;
  image_src?: string | null;
  slug: string;
  description: string;
  children: CategoryNode[];
}

export interface CategoryResponse {
  id: number;
  name: string;
  slug: string;
  parent: number;
  description: string;
  count: number;
  image?: {
    id: number;
    src: string;
  } | null;
}

export interface CategoriesResponse {
  raw_categories: any[];
  tree: CategoryNode[];
  flattened: CategoryNode[];
}

// Price Update Types
export interface PriceUpdateOptions {
  batch_size?: number;
  max_retries?: number;
  delay_between_batches?: number;
}

export interface PriceUpdateRequest {
  category_id: number | null; // null = all categories
  adjustment_type: 'increase' | 'decrease';
  adjustment_mode: 'amount' | 'percent';
  adjustment_value: number;
  options?: PriceUpdateOptions;
}

// Delete Products Types
export interface DeleteOptions {
  delete_media?: boolean;
  dry_run?: boolean;
  verbose?: boolean;
  parallel_media?: boolean;
  batch_size?: number;
  stream_batch_size?: number;
  protection_mode?: 'auto' | 'manual';
  protection_preset?: 'conservative' | 'moderate' | 'aggressive';
  rate_limit_rps?: number;
  max_retries?: number;
}

// Job Scope and Request Types
export interface JobScope {
  product_ids?: number[] | null;
  category_ids?: number[] | null;
  search?: string | null;
}

export interface PriceRule {
  op: 'increase' | 'decrease';
  type: 'percent' | 'fixed';
  value: number;
}

export interface UpdatePricesOptions {
  apply_to_variations?: boolean;
  batch_size?: number;
  rate_limit_rps?: number;
  max_retries?: number;
  delay_between_batches?: number;
}

export interface UpdatePricesRequest {
  scope: JobScope;
  rule: PriceRule;
  options?: UpdatePricesOptions;
}

export interface BulkUpdateFieldsRequest {
  scope: JobScope;
  patch: {
    title_prefix?: string;
    title_suffix?: string;
    short_description?: string;
    description?: string;
  };
  options?: {
    batch_size?: number;
    rate_limit_rps?: number;
    max_retries?: number;
  };
}

export interface DeleteProductsRequest {
  mode: 'urls' | 'categories' | 'all' | 'streaming';
  urls?: string[];
  category_ids?: number[];
  options?: DeleteOptions;
}

// Job Types
export interface JobProgress {
  done: number;
  total: number;
  percent: number;
}

export interface JobMetrics {
  success: number;
  failed: number;
  retried: number;
  skipped: number;
}

export interface JobCurrent {
  product_id?: number;
  action?: string;
}

export interface JobResponse {
  job_id: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  progress?: JobProgress;
  metrics?: JobMetrics;
  current?: JobCurrent;
  started_at?: string;
  updated_at?: string;
}

export interface JobCreateResponse {
  job_id: string;
  status: string;
}

// SSE Event Types
export interface SSELogEvent {
  ts: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  msg: string;
  product_id?: number;
}

export interface SSEProgressEvent {
  done: number;
  total: number;
  percent: number;
  success: number;
  failed: number;
  retried: number;
  skipped: number;
  current: {
    product_id?: number;
    action?: string;
  };
}

export interface SSEStatusEvent {
  status: string;
  total?: number;
}

// Image Types
export interface ImageInfo {
  mode: string; // "wp", "fifu", or "none"
  original: string;
  thumb: string;
  attachment_id?: number | null;
  fifu_url?: string | null;
  alt?: string | null;
}

// Product Types (for reference, may not be used in initial rewrite)
export interface ProductSummary {
  id: number;
  name: string;
  type: string;
  status: string;
  price?: string;
  stock_status?: string;
  variations_count?: number;
  image: ImageInfo;
}

export interface ProductDetail {
  id: number;
  name: string;
  type: string;
  status: string;
  sku?: string | null;
  price?: string | null;
  regular_price?: string | null;
  sale_price?: string | null;
  stock_status?: string | null;
  stock_quantity?: number | null;
  short_description?: string | null;
  description?: string | null;
  image: ImageInfo;
  gallery: ImageInfo[];
  meta_data?: any[] | null;
}

// Product Editor Types
export interface EditableImage {
  id?: number | null;
  src: string;
  alt: string;
  position: number;
  delete_from_media?: boolean;
}

export interface EditableAttribute {
  name: string;
  slug: string;
  options: string[];
  original_data?: any;
}

export interface EditableVariation {
  id?: number | null;
  sku: string;
  attributes: Record<string, string>;
  regular_price: string;
  sale_price: string;
  image_id?: number | null;
  image_src?: string | null;
  status?: 'existing' | 'new' | 'modified' | 'to_delete';
}

export interface EditableProduct {
  id: number;
  slug: string;
  name: string;
  short_description: string;
  description: string;
  attributes: EditableAttribute[];
  images: EditableImage[];
  variations: EditableVariation[];
  images_to_delete_media_ids?: number[];
}

export interface ProductUpdateRequest {
  name?: string;
  short_description?: string;
  description?: string;
  attributes?: EditableAttribute[];
  images?: EditableImage[];
  variations?: EditableVariation[];
  images_to_delete_media_ids?: number[];
}
