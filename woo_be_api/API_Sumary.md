# Backend API Documentation

## 1. Overview

The WooCommerce Backend API is a FastAPI-based REST API that provides programmatic access to WooCommerce store management operations. The backend acts as a proxy layer between frontend clients and WooCommerce/WordPress APIs, providing:

- Store configuration management
- Product and category operations
- Background job processing with real-time progress updates via Server-Sent Events (SSE)
- Feed generation for Google Merchant Center and Bing
- Description builder with template engine
- BMSM (Buy More Save More) rules management
- Upsell combo management
- Product review management
- Image proxying and resizing

The API is stateless and uses Redis for job state management and event streaming. All operations are store-scoped, supporting multi-tenant usage.

## 2. Base URL & Versioning

The API is versioned with two active versions:

- **v1**: `/api/v1` - Legacy endpoints, full feature set
- **v2**: `/api/v2` - Modern endpoints with improved schemas and expanded product cards

Base URL examples:
- Development: `http://localhost:8000`
- Production: `https://api.example.com`

All endpoints are prefixed with `/api/v1` or `/api/v2`.

## 3. Authentication & Authorization

The API uses **store-based authentication** via the `X-Store-Key` header. There is no global authentication mechanism.

### Authentication Method

Each store has an API key configured in `woo_config.json`. Clients must include this key in the `X-Store-Key` header for protected endpoints.

**Header:**
```
X-Store-Key: <store_api_key>
```

### Authentication Rules

1. **Required endpoints**: Most v2 endpoints and sensitive operations require `X-Store-Key`
2. **Optional endpoints**: Some v1 endpoints (like listing stores, health checks) do not require authentication
3. **SSE endpoints**: Use job tokens for access control; `X-Store-Key` is optional if a valid job token is provided
4. **Store ID matching**: The `store_id` in the URL path must match the store associated with the provided API key

### Error Responses

- `403 Forbidden`: Missing or invalid `X-Store-Key` header
- `404 Not Found`: Store not found (may also indicate authentication failure for security)
- Error headers: `X-Error-Code` may contain `missing_store_key` or `invalid_store_key`

### Client Session (Multi-User Safety)

Some endpoints (notably feeds API) support `X-Client-Session` header for multi-user isolation. This is optional but recommended for production deployments with multiple concurrent users.

## 4. Common Conventions

### Request Headers

- `Content-Type: application/json` - Required for JSON request bodies
- `X-Store-Key: <key>` - Store API key (required for protected endpoints)
- `X-Client-Session: <session_id>` - Client session ID (optional, for multi-user isolation)
- `Last-Event-ID: <event_id>` - For SSE resumption (optional)

### Response Format

All responses are JSON unless otherwise specified (e.g., file downloads, SSE streams).

**Success Response:**
```json
{
  "field1": "value1",
  "field2": "value2"
}
```

**Error Response:**
```json
{
  "detail": "Error message describing what went wrong"
}
```

### Pagination

Pagination is used for list endpoints:

- `page`: Page number (1-indexed, minimum 1)
- `per_page`: Items per page (typically 1-100, default varies by endpoint)
- `total`: Total number of items

**Pagination Response:**
```json
{
  "page": 1,
  "per_page": 50,
  "total": 150,
  "items": [...]
}
```

### Date/Time Formats

- ISO 8601 format: `2024-01-15T10:30:00Z` or `2024-01-15T10:30:00+00:00`
- All timestamps are UTC

### ID Formats

- Store IDs: URL-safe slugs (e.g., `my-store-name`)
- Product IDs: Integers
- Category IDs: Integers
- Job IDs: UUID strings (e.g., `550e8400-e29b-41d4-a716-446655440000`)
- Job Tokens: Hex-encoded random strings (64 characters)

### Naming Conventions

- Endpoints use kebab-case: `/stores/{store_id}/products`
- JSON fields use snake_case: `product_id`, `store_url`
- Store IDs are generated from store names by converting to lowercase and replacing spaces/special chars with hyphens

## 5. Error Handling

### HTTP Status Codes

- `200 OK`: Successful request
- `201 Created`: Resource created successfully
- `400 Bad Request`: Invalid request parameters or body
- `401 Unauthorized`: Missing or invalid authentication (client session mismatch)
- `403 Forbidden`: Authentication failed (invalid store key or job token)
- `404 Not Found`: Resource not found
- `413 Request Entity Too Large`: File upload exceeds size limit
- `500 Internal Server Error`: Server error
- `502 Bad Gateway`: Error communicating with WooCommerce/WordPress
- `503 Service Unavailable`: Redis unavailable or service temporarily down

### Error Response Schema

```json
{
  "detail": "Human-readable error message"
}
```

Some errors include additional headers:
- `X-Error-Code`: Machine-readable error code (e.g., `missing_store_key`, `invalid_job_token`)

### Common Error Scenarios

1. **Store not found**: `404` with detail "Store '{store_id}' not found"
2. **Invalid store key**: `403` with detail "Invalid X-Store-Key"
3. **Missing required field**: `400` with detail describing missing field
4. **Redis unavailable**: `503` with detail "Redis connection failed: ..."
5. **WooCommerce API error**: `502` or `500` with detail from WooCommerce

## 6. API Endpoints

### Root & Health

#### GET /

Root endpoint.

**Response:**
```json
{
  "message": "WooCommerce Backend API",
  "version": "1.0.0",
  "docs": "/docs"
}
```

#### GET /api/v1/health

Health check endpoint.

**Response:**
```json
{
  "ok": true
}
```

#### GET /api/v1/health/redis

Check Redis connection health.

**Response:**
```json
{
  "ok": true,
  "redis": "connected"
}
```

**Error Response:**
```json
{
  "ok": false,
  "redis": "disconnected",
  "error": "Connection refused"
}
```

### Stores (v1)

#### GET /api/v1/stores

List all stores (no secrets returned).

**Authentication:** Not required

**Response:**
```json
[
  {
    "id": "my-store",
    "name": "My Store",
    "store_url": "https://example.com",
    "has_wc_keys": true,
    "has_wp_creds": true
  }
]
```

#### GET /api/v1/stores/{store_id}

Get store details.

**Authentication:** Not required

**Path Parameters:**
- `store_id` (string): Store ID

**Response:**
```json
{
  "id": "my-store",
  "name": "My Store",
  "store_url": "https://example.com",
  "has_wc_keys": true,
  "has_wp_creds": true,
  "is_active": true,
  "api_key": "abc123..."
}
```

#### POST /api/v1/stores/{store_id}/connect

Test connection to WooCommerce and WordPress APIs.

**Authentication:** Not required

**Response:**
```json
{
  "success": true,
  "message": "Kết nối thành công!",
  "woocommerce": {
    "ok": true,
    "message": "Connected"
  },
  "wordpress": {
    "ok": true,
    "message": "Connected"
  }
}
```

**Notes:**
- Uses 10-second timeout for connection tests
- WordPress test is optional (fails gracefully if WP credentials not configured)

#### POST /api/v1/stores

Create a new store configuration.

**Authentication:** Not required

**Request Body:**
```json
{
  "name": "My Store",
  "store_url": "https://example.com",
  "consumer_key": "ck_...",
  "consumer_secret": "cs_...",
  "wp_username": "user",
  "wp_app_password": "xxxx xxxx xxxx xxxx",
  "set_as_active": false
}
```

**Response:**
```json
{
  "id": "my-store",
  "name": "My Store",
  "store_url": "https://example.com",
  "has_wc_keys": true,
  "has_wp_creds": true,
  "is_active": false,
  "api_key": "generated_key..."
}
```

**Notes:**
- API key is auto-generated if not provided
- Store name must be unique
- Validates store URL format and required fields

#### PUT /api/v1/stores/{store_id}

Update store configuration.

**Authentication:** Not required

**Request Body:**
```json
{
  "name": "Updated Store Name",
  "store_url": "https://new-url.com",
  "consumer_key": "ck_...",
  "consumer_secret": "cs_...",
  "wp_username": null,
  "wp_app_password": null,
  "api_key": "new_key"
}
```

**Notes:**
- All fields are optional
- Setting `api_key` to empty string removes it
- Setting `wp_username` or `wp_app_password` to null removes them

#### DELETE /api/v1/stores/{store_id}

Delete a store configuration.

**Authentication:** Not required

**Response:**
```json
{
  "success": true,
  "message": "Store 'My Store' deleted successfully"
}
```

**Notes:**
- If deleted store was active, first remaining store becomes active

#### POST /api/v1/stores/{store_id}/set-active

Set a store as the active store.

**Authentication:** Not required

**Response:**
```json
{
  "success": true,
  "message": "Store 'My Store' set as active"
}
```

### Products (v1)

#### GET /api/v1/stores/{store_id}/products

List products for a store.

**Authentication:** Not required

**Query Parameters:**
- `page` (integer, default: 1, min: 1): Page number
- `per_page` (integer, default: 50, min: 1, max: 100): Items per page
- `search` (string, optional): Search query
- `include_image` (boolean, default: true): Include image data

**Response:**
```json
{
  "page": 1,
  "per_page": 50,
  "total": 150,
  "items": [
    {
      "id": 123,
      "name": "Product Name",
      "type": "simple",
      "status": "publish",
      "price": "29.99",
      "stock_status": "instock",
      "variations_count": null,
      "image": {
        "mode": "url",
        "original": "https://example.com/image.jpg",
        "thumb": "https://example.com/image-300x300.jpg"
      }
    }
  ]
}
```

**Notes:**
- For variable products, `variations_count` is fetched separately
- Image normalization handles missing images, external URLs, and relative paths

#### GET /api/v1/stores/{store_id}/products/{product_id}

Get product details.

**Authentication:** Not required

**Path Parameters:**
- `product_id` (integer): Product ID

**Response:**
```json
{
  "id": 123,
  "name": "Product Name",
  "type": "simple",
  "status": "publish",
  "sku": "SKU123",
  "price": "29.99",
  "regular_price": "39.99",
  "sale_price": "29.99",
  "stock_status": "instock",
  "stock_quantity": 10,
  "short_description": "Short desc",
  "description": "Full description",
  "image": {
    "id": 456,
    "src": "https://example.com/image.jpg",
    "alt": "Image alt"
  },
  "gallery": [
    {
      "id": 457,
      "src": "https://example.com/image2.jpg",
      "alt": "Gallery image"
    }
  ],
  "meta_data": []
}
```

### Categories (v1)

#### GET /api/v1/stores/{store_id}/categories

Get all categories with tree structure.

**Authentication:** Not required

**Response:**
```json
{
  "raw_categories": [
    {
      "id": 1,
      "name": "Category",
      "parent": 0,
      "count": 10,
      "image": null,
      "slug": "category",
      "description": ""
    }
  ],
  "tree": [
    {
      "id": 1,
      "name": "Category",
      "parent": 0,
      "count": 10,
      "level": 0,
      "full_path": "Category",
      "image_id": null,
      "image_src": null,
      "slug": "category",
      "description": "",
      "children": []
    }
  ],
  "flattened": [
    {
      "id": 1,
      "name": "Category",
      "parent": 0,
      "count": 10,
      "level": 0,
      "full_path": "Category",
      "image_id": null,
      "image_src": null,
      "slug": "category",
      "description": "",
      "children": []
    }
  ]
}
```

**Notes:**
- `tree` contains hierarchical structure with nested children
- `flattened` contains flat list with level indicators
- `raw_categories` contains raw WooCommerce API response

#### GET /api/v1/stores/{store_id}/categories/{category_id}

Get a single category by ID.

**Authentication:** Not required

**Response:**
```json
{
  "id": 1,
  "name": "Category",
  "slug": "category",
  "parent": 0,
  "description": "",
  "count": 10,
  "image": null
}
```

#### GET /api/v1/stores/{store_id}/categories/{category_id}/products

Get products in a category.

**Authentication:** Not required

**Query Parameters:**
- `page` (integer, default: 1): Page number
- `per_page` (integer, default: 100, max: 100): Items per page
- `status` (string, default: "any"): Product status filter

**Response:**
```json
{
  "category_id": 1,
  "category_name": "Category",
  "total": 50,
  "page": 1,
  "per_page": 100,
  "products": [...]
}
```

#### POST /api/v1/stores/{store_id}/categories

Create a new category.

**Authentication:** Not required

**Request Body:**
```json
{
  "name": "New Category",
  "parent": 0,
  "description": "Category description",
  "slug": "new-category",
  "image_id": 123
}
```

#### PUT /api/v1/stores/{store_id}/categories/{category_id}

Update a category.

**Authentication:** Not required

**Request Body:** (all fields optional)
```json
{
  "name": "Updated Category",
  "slug": "updated-category",
  "parent": 0,
  "description": "Updated description",
  "image_id": 124
}
```

#### DELETE /api/v1/stores/{store_id}/categories/{category_id}

Delete a category.

**Authentication:** Not required

**Query Parameters:**
- `force` (boolean, default: true): Force delete

**Response:**
```json
{
  "success": true,
  "message": "Category deleted"
}
```

#### POST /api/v1/stores/{store_id}/categories/{category_id}/image/upload

Upload image for a category.

**Authentication:** Not required

**Request:** Multipart form data with `file` field

**Response:**
```json
{
  "id": 1,
  "name": "Category",
  "slug": "category",
  "parent": 0,
  "description": "",
  "count": 10,
  "image": {
    "id": 456,
    "src": "https://example.com/image.jpg"
  }
}
```

**Notes:**
- Requires WordPress credentials configured
- File is uploaded to WordPress media library

#### POST /api/v1/stores/{store_id}/categories/bulk

Perform bulk actions on categories.

**Authentication:** Not required

**Request Body:**
```json
{
  "action": "delete",
  "category_ids": [1, 2, 3],
  "params": {
    "new_parent_id": 0
  }
}
```

**Actions:**
- `delete`: Delete multiple categories
- `change_parent`: Change parent for multiple categories
- `update`: Bulk update with same data

**Response:**
```json
{
  "success": 2,
  "failed": 1,
  "results": [
    {
      "category_id": 1,
      "status": "success"
    },
    {
      "category_id": 2,
      "status": "failed",
      "error": "Error message"
    }
  ]
}
```

### Jobs (v1)

All job endpoints require Redis to be available.

#### POST /api/v1/stores/{store_id}/jobs/delete-products

Create delete products job.

**Authentication:** Not required

**Request Body:**
```json
{
  "mode": "urls",
  "urls": ["https://example.com/product/abc"],
  "category_ids": null,
  "options": {
    "dry_run": false,
    "batch_size": 25,
    "rate_limit_rps": 5.0,
    "max_retries": 5,
    "delete_media": false
  }
}
```

**Modes:**
- `urls`: Delete products by URLs (requires `urls` array)
- `categories`: Delete products in categories (requires `category_ids` array)

**Response:**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "job_token": "abc123...",
  "status": "queued"
}
```

**Error Responses:**
- `400`: Missing required fields for selected mode
- `503`: Redis unavailable

#### POST /api/v1/stores/{store_id}/jobs/update-prices

Create update prices job.

**Authentication:** Not required

**Request Body:**
```json
{
  "category_id": 1,
  "adjustment_type": "percent",
  "adjustment_mode": "increase",
  "adjustment_value": 10.0,
  "options": {
    "dry_run": false,
    "batch_size": 25,
    "rate_limit_rps": 5.0,
    "max_retries": 5,
    "apply_to_variations": true
  }
}
```

**Adjustment Types:**
- `percent`: Percentage adjustment
- `fixed`: Fixed amount adjustment

**Adjustment Modes:**
- `increase`: Increase price
- `decrease`: Decrease price

#### POST /api/v1/stores/{store_id}/jobs/bulk-update

Create bulk update job (title, description updates).

**Authentication:** Not required

**Request Body:**
```json
{
  "mode": "categories",
  "urls": null,
  "category_ids": [1, 2],
  "update_title": true,
  "prefix": "New ",
  "suffix": "",
  "avoid_duplicate_title": true,
  "update_short_description": true,
  "short_template": "Template {name}",
  "update_description": true,
  "description_mode": "replace",
  "description_template": "Full template",
  "use_marker_for_description": false,
  "options": {
    "dry_run": false,
    "batch_size": 25,
    "rate_limit_rps": 5.0,
    "max_retries": 5
  }
}
```

**Modes:**
- `urls`: Update products by URLs
- `categories`: Update products in categories

**Description Modes:**
- `replace`: Replace entire description
- `prepend`: Add to beginning
- `append`: Add to end

**Validation:**
- At least one update option must be enabled

#### POST /api/v1/stores/{store_id}/jobs/bulk-update-fields

Create bulk update fields job (generic field updates).

**Authentication:** Not required

**Request Body:**
```json
{
  "scope": {
    "product_ids": [1, 2, 3],
    "category_ids": null,
    "search": null
  },
  "patch": {
    "title_prefix": "New ",
    "title_suffix": "",
    "short_description": "New short desc",
    "description": "New description"
  },
  "options": {
    "dry_run": false,
    "batch_size": 25,
    "rate_limit_rps": 5.0,
    "max_retries": 5
  }
}
```

#### POST /api/v1/stores/{store_id}/jobs/import-csv

Create CSV import job.

**Authentication:** Not required

**Request Body:**
```json
{
  "csv_content": "id,name,price\n1,Product,29.99",
  "category_id": 1,
  "tag": "imported",
  "options": {
    "dry_run": false,
    "batch_size": 25,
    "rate_limit_rps": 5.0,
    "max_retries": 5
  }
}
```

**Notes:**
- CSV content must be provided as string
- Products are created/updated based on CSV data

#### GET /api/v1/stores/{store_id}/jobs/{job_id}

Get job status.

**Authentication:** Not required

**Response:**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "running",
  "progress": {
    "done": 50,
    "total": 100,
    "percent": 50
  },
  "metrics": {
    "success": 45,
    "failed": 5,
    "retried": 2,
    "skipped": 0
  },
  "current": {
    "product_id": 123,
    "action": "updating"
  },
  "started_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:35:00Z"
}
```

**Status Values:**
- `queued`: Job is queued, not started
- `running`: Job is currently executing
- `done`: Job completed successfully
- `failed`: Job failed with errors
- `cancelled`: Job was cancelled

**Error Responses:**
- `404`: Job not found or store mismatch
- `503`: Redis unavailable

#### POST /api/v1/stores/{store_id}/jobs/{job_id}/pause

Pause a running job.

**Authentication:** Not required

**Response:**
```json
{
  "status": "paused",
  "message": "Job đã tạm dừng"
}
```

**Notes:**
- Job will pause at next checkpoint
- Pause flag expires after 24 hours

#### POST /api/v1/stores/{store_id}/jobs/{job_id}/resume

Resume a paused job.

**Authentication:** Not required

**Response:**
```json
{
  "status": "running",
  "message": "Job đã tiếp tục"
}
```

#### POST /api/v1/stores/{store_id}/jobs/{job_id}/stop

Stop a job (alias for cancel).

**Authentication:** Not required

#### POST /api/v1/stores/{store_id}/jobs/{job_id}/cancel

Cancel a job.

**Authentication:** Not required

**Response:**
```json
{
  "status": "cancelled",
  "message": "Job đã dừng"
}
```

**Notes:**
- Job will stop at next checkpoint
- Cannot resume a cancelled job

### Server-Sent Events (SSE) (v1)

#### GET /api/v1/stores/{store_id}/jobs/{job_id}/events

Stream job events via Server-Sent Events.

**Authentication:** Job token required (query parameter)

**Query Parameters:**
- `token` (string, required): Job token from job creation response
- `last_event_id` (string, optional): Resume from specific event ID

**Headers:**
- `Last-Event-ID` (optional): Alternative way to specify last event ID
- `X-Store-Key` (optional): Store key (token provides security)

**Response:** `text/event-stream`

**Event Types:**
- `connected`: Connection established
- `snapshot`: Current job state snapshot
- `log`: Log message (info, success, warning, error)
- `progress`: Progress update
- `status`: Status change
- `error`: Error event (stream ends)

**Example Event:**
```
event: log
data: {"level": "info", "message": "Processing product 123"}

event: progress
data: {"done": 50, "total": 100, "success": 45, "failed": 5}

event: status
data: {"status": "done", "total": 100}
```

**Notes:**
- Token is mandatory for security
- `X-Store-Key` is optional if token is valid
- Supports `Last-Event-ID` header for resuming from specific event
- Stream ends on error or job completion

#### GET /api/v1/stores/{store_id}/sse

Alternative SSE endpoint with query parameters.

**Query Parameters:**
- `job_id` (string, required): Job ID
- `token` (string, required): Job token

**Notes:**
- Same behavior as `/events` endpoint
- Provided for compatibility with EventSource API limitations

### Images (v1)

#### GET /api/v1/img

Proxy and resize image with SSRF protection.

**Authentication:** Not required

**Query Parameters:**
- `u` (string, required): Image URL
- `w` (integer, default: 240, min: 1, max: 2000): Width
- `h` (integer, default: 240, min: 1, max: 2000): Height

**Response:** Image file (WebP or JPEG)

**Security:**
- Blocks private IP addresses
- Validates against allowed domains (if configured)
- Converts to WebP (fallback to JPEG)

**Error Responses:**
- `400`: Invalid URL
- `403`: Private IP or domain not allowed
- `502`: Error fetching image

**Notes:**
- Images are cached for 1 day
- Maximum dimensions: 2000x2000

### Reviews (v1)

#### POST /api/v1/stores/{store_id}/reviews/by-urls

Fetch products and their reviews by URLs.

**Authentication:** Not required

**Request Body:**
```json
{
  "urls": [
    "https://example.com/product/abc",
    "https://example.com/product/xyz"
  ]
}
```

**Response:**
```json
{
  "results": [
    {
      "url": "https://example.com/product/abc",
      "product_id": 123,
      "product_name": "Product Name",
      "permalink": "https://example.com/product/abc",
      "reviews": [
        {
          "id": 1,
          "reviewer": "John Doe",
          "reviewer_email": "john@example.com",
          "rating": 5,
          "review": "Great product!",
          "status": "approved",
          "date_created": "2024-01-15T10:30:00Z",
          "images": []
        }
      ]
    }
  ]
}
```

#### POST /api/v1/stores/{store_id}/reviews

Create a product review.

**Authentication:** Not required

**Request Body:**
```json
{
  "product_id": 123,
  "reviewer": "John Doe",
  "reviewer_email": "john@example.com",
  "rating": 5,
  "review_text": "Great product!",
  "image_urls": [
    "https://example.com/review-image.jpg"
  ]
}
```

**Response:**
```json
{
  "id": 1,
  "product_id": 123,
  "product_name": "Product Name",
  "reviewer": "John Doe",
  "reviewer_email": "john@example.com",
  "rating": 5,
  "review_text": "Great product!",
  "status": "approved",
  "date_created": "2024-01-15T10:30:00Z",
  "images": [
    {
      "id": 456
    }
  ]
}
```

**Notes:**
- Images are uploaded to WordPress media library if WP credentials configured
- Review is automatically approved

#### POST /api/v1/stores/{store_id}/reviews/batch

Create multiple reviews as a background job.

**Authentication:** Not required

**Request Body:**
```json
[
  {
    "product_id": 123,
    "reviewer": "John Doe",
    "reviewer_email": "john@example.com",
    "rating": 5,
    "review_text": "Great product!",
    "image_urls": []
  }
]
```

**Response:**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued"
}
```

#### DELETE /api/v1/stores/{store_id}/reviews/{review_id}

Delete a review and its associated media.

**Authentication:** Not required

**Response:**
```json
{
  "success": true,
  "message": "Review deleted successfully"
}
```

**Notes:**
- Attempts to delete associated media if WP client available

#### POST /api/v1/stores/{store_id}/reviews/{review_id}/verify

Mark review as verified owner.

**Authentication:** Not required

**Response:**
```json
{
  "success": true,
  "message": "Review marked as verified"
}
```

**Notes:**
- Requires custom WooCommerce endpoint: `/wp-json/wc/v3/equineop/mark-verified`

#### POST /api/v1/stores/{store_id}/reviews/{review_id}/images

Upload images for a review.

**Authentication:** Not required

**Request:** Multipart form data with `files` field (multiple files)

**Response:**
```json
{
  "success": true,
  "message": "Uploaded and attached 2 image(s)",
  "images": [
    {
      "id": 456,
      "src": "https://example.com/image.jpg",
      "alt": "Review image"
    }
  ]
}
```

**Notes:**
- Requires WordPress credentials
- Images are attached to review via custom endpoint

### Product Editor (v1)

#### GET /api/v1/stores/{store_id}/products/editor/by-url

Fetch product details by URL for editing.

**Authentication:** Not required

**Query Parameters:**
- `url` (string, required): Product URL

**Response:**
```json
{
  "id": 123,
  "name": "Product Name",
  "short_description": "Short desc",
  "description": "Full description",
  "attributes": [...],
  "images": [...],
  "variations": [...]
}
```

#### GET /api/v1/stores/{store_id}/products/editor/{product_id}

Fetch product details by ID for editing.

**Authentication:** Not required

**Response:** Same as `/by-url`

#### PUT /api/v1/stores/{store_id}/products/editor/{product_id}

Update product details from editor.

**Authentication:** Not required

**Request Body:**
```json
{
  "name": "Updated Name",
  "short_description": "Updated short",
  "description": "Updated description",
  "attributes": [...],
  "images": [...],
  "variations": [...],
  "images_to_delete_media_ids": [456, 457]
}
```

**Response:**
```json
{
  "success": true,
  "product_id": 123,
  "results": {
    "updated": true,
    "images_deleted": 2
  }
}
```

#### POST /api/v1/stores/{store_id}/products/editor/{product_id}/images/upload

Upload images for product editor.

**Authentication:** Not required

**Request:** Multipart form data with `files` field (multiple files)

**Response:**
```json
[
  {
    "id": 456,
    "src": "https://example.com/image.jpg",
    "alt": "Image alt",
    "position": 0,
    "delete_from_media": false
  }
]
```

**Notes:**
- Requires WordPress credentials
- Returns image data ready for editor

### FBT Combos (v1)

FBT (Frequently Bought Together) combos management.

#### GET /api/v1/stores/{store_id}/fbt-combos

List combos with pagination.

**Authentication:** Not required

**Query Parameters:**
- `search` (string, default: ""): Search query
- `page` (integer, default: 1): Page number
- `per_page` (integer, default: 50, max: 100): Items per page

**Response:**
```json
{
  "page": 1,
  "per_page": 50,
  "total": 100,
  "items": [
    {
      "main_id": 123,
      "main_name": "Main Product",
      "enabled": true,
      "apply_scope": "main_only",
      "product_ids": [123, 124, 125],
      "main_ids": [123],
      "priority": 0,
      "discount_rules": [...],
      "combo_ids": [],
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ],
  "skipped_count": 0,
  "skipped_ids": null
}
```

**Notes:**
- Requires WordPress credentials (FBT API uses WP REST API)

#### GET /api/v1/stores/{store_id}/fbt-combos/all

Get all combos (no pagination).

**Authentication:** Not required

**Query Parameters:**
- `search` (string, default: ""): Search query

**Response:** Same structure as paginated list, but includes all combos

#### GET /api/v1/stores/{store_id}/fbt-combos/{main_id}

Get combo details by main_id.

**Authentication:** Not required

**Response:**
```json
{
  "main_id": 123,
  "main_name": "Main Product",
  "enabled": true,
  "apply_scope": "main_only",
  "product_ids": [123, 124, 125],
  "main_ids": [123],
  "priority": 0,
  "discount_rules": [...],
  "combo_ids": [],
  "updated_at": "2024-01-15T10:30:00Z"
}
```

#### POST /api/v1/stores/{store_id}/fbt-combos

Create a new combo.

**Authentication:** Not required

**Request Body:**
```json
{
  "main_id": 123,
  "main_name": "Main Product",
  "enabled": true,
  "apply_scope": "main_only",
  "product_ids": [123, 124, 125],
  "main_ids": [123],
  "priority": 0,
  "discount_rules": [...],
  "combo_ids": []
}
```

**Response:** Same as GET endpoint

#### PUT /api/v1/stores/{store_id}/fbt-combos/{main_id}

Update an existing combo.

**Authentication:** Not required

**Request Body:** Same as POST (all fields optional)

**Response:** Same as GET endpoint

#### DELETE /api/v1/stores/{store_id}/fbt-combos/{main_id}

Delete a combo.

**Authentication:** Not required

**Response:**
```json
{
  "success": true,
  "message": "Combo 123 deleted successfully"
}
```

#### POST /api/v1/stores/{store_id}/fbt-combos/search-products

Search products for combo selection.

**Authentication:** Not required

**Request Body:**
```json
{
  "query": "product name",
  "page": 1,
  "per_page": 20
}
```

**Response:**
```json
{
  "products": [
    {
      "id": 123,
      "name": "Product Name",
      "sku": "SKU123",
      "price": "29.99"
    }
  ],
  "total": 50
}
```

#### POST /api/v1/stores/{store_id}/fbt-combos/resolve

Resolve combo recommendations for a product.

**Authentication:** Not required

**Request Body:**
```json
{
  "product_id": 123
}
```

**Response:**
```json
{
  "combo_id": 123,
  "recommended_product_ids": [124, 125],
  "discount_rules": [...]
}
```

#### POST /api/v1/stores/{store_id}/fbt-combos/test-connection

Test connection to FBT API.

**Authentication:** Not required

**Response:**
```json
{
  "success": true,
  "message": "Connected"
}
```

### BMSM (v1)

BMSM (Buy More Save More) rules management.

#### POST /api/v1/stores/{store_id}/bmsm/search-products

Search products for BMSM rules.

**Authentication:** Not required

**Request Body:**
```json
{
  "query": "product name",
  "page": 1,
  "per_page": 20,
  "fields": ["id", "name", "sku"]
}
```

**Response:**
```json
{
  "products": [...],
  "total": 50,
  "page": 1,
  "per_page": 20
}
```

#### GET /api/v1/stores/{store_id}/bmsm/products/{product_id}/rules

Get BMSM rules for a product.

**Authentication:** Not required

**Response:**
```json
{
  "product_id": 123,
  "product_name": "Product Name",
  "rules": {
    "enabled": true,
    "rules": [
      {
        "min_qty": 2,
        "discount_type": "percent",
        "discount_value": 10.0
      }
    ]
  }
}
```

#### PUT /api/v1/stores/{store_id}/bmsm/products/{product_id}/rules

Update BMSM rules for a product.

**Authentication:** Not required

**Request Body:**
```json
{
  "rules": {
    "enabled": true,
    "rules": [
      {
        "min_qty": 2,
        "discount_type": "percent",
        "discount_value": 10.0
      }
    ]
  }
}
```

**Response:** Same as GET endpoint

#### POST /api/v1/stores/{store_id}/bmsm/products/{product_id}/rules/disable

Disable BMSM for a product (preserves rules).

**Authentication:** Not required

**Response:**
```json
{
  "success": true,
  "message": "BMSM disabled for product 123"
}
```

#### DELETE /api/v1/stores/{store_id}/bmsm/products/{product_id}/rules

Clear BMSM rules for a product.

**Authentication:** Not required

**Response:**
```json
{
  "success": true,
  "message": "BMSM rules cleared for product 123"
}
```

#### POST /api/v1/stores/{store_id}/bmsm/inventory

Get BMSM inventory index with pagination.

**Authentication:** Not required

**Request Body:**
```json
{
  "page": 1,
  "per_page": 50,
  "search": "",
  "filter_type": "all"
}
```

**Filter Types:**
- `all`: All products
- `enabled`: Only enabled BMSM
- `disabled_with_rules`: Disabled but has rules
- `invalid`: Invalid configurations
- `with_rules`: Has rules (enabled or disabled)
- `no_rules`: No rules configured

**Response:**
```json
{
  "page": 1,
  "per_page": 50,
  "total": 100,
  "items": [
    {
      "product_id": 123,
      "product_name": "Product Name",
      "enabled": true,
      "rules_count": 2,
      "has_valid_rules": true
    }
  ],
  "summary": {
    "total": 100,
    "enabled": 50,
    "disabled_with_rules": 10,
    "invalid": 5
  }
}
```

#### GET /api/v1/stores/{store_id}/bmsm/inventory/all

Get all BMSM inventory index (no pagination).

**Authentication:** Not required

**Query Parameters:**
- `search` (string, default: ""): Search query
- `filter_type` (string, default: "all"): Filter type

**Response:** Same structure as paginated endpoint

#### POST /api/v1/stores/{store_id}/bmsm/test-connection

Test connection to BMSM Index API.

**Authentication:** Not required

**Response:**
```json
{
  "success": true,
  "message": "Connected"
}
```

**Notes:**
- Requires WordPress credentials (BMSM Index API uses WP REST API)

### Products (v2)

#### GET /api/v2/stores/{store_id}/products/search

Search products and return ProductCards.

**Authentication:** Not required

**Query Parameters:**
- `q` (string, required, min length: 1): Search query
- `limit` (integer, default: 20, min: 1, max: 100): Result limit

**Response:**
```json
{
  "items": [
    {
      "id": 123,
      "name": "Product Name",
      "sku": "SKU123",
      "price": "29.99",
      "regular_price": "39.99",
      "sale_price": "29.99",
      "stock_status": "instock",
      "image": {
        "id": 456,
        "src": "https://example.com/image.jpg",
        "alt": "Image alt"
      }
    }
  ]
}
```

#### POST /api/v2/stores/{store_id}/products/cards

Get ProductCards for given IDs (order-preserving).

**Authentication:** Not required

**Request Body:**
```json
{
  "ids": [123, 124, 125]
}
```

**Response:**
```json
{
  "items": [
    {
      "id": 123,
      "name": "Product Name",
      "sku": "SKU123",
      "price": "29.99",
      "regular_price": "39.99",
      "sale_price": "29.99",
      "stock_status": "instock",
      "image": {
        "id": 456,
        "src": "https://example.com/image.jpg",
        "alt": "Image alt"
      }
    }
  ]
}
```

**Notes:**
- Returns products in the same order as requested IDs
- Missing products are omitted (no error)

### Upsell Combos (v2)

#### GET /api/v2/stores/{store_id}/upsell-combos

List upsell combos with expanded product cards.

**Authentication:** Not required

**Query Parameters:**
- `page` (integer, default: 1): Page number
- `page_size` (integer, default: 50, max: 100): Items per page
- `search` (string, default: ""): Search query

**Response:**
```json
{
  "items": [
    {
      "combo_id": 123,
      "main_product": {
        "id": 123,
        "name": "Main Product",
        "sku": "SKU123",
        "price": "29.99",
        "image": {...}
      },
      "recommended_products": [
        {
          "id": 124,
          "name": "Recommended Product",
          "sku": "SKU124",
          "price": "19.99",
          "image": {...}
        }
      ],
      "discount_rules": [...],
      "enabled": true,
      "priority": 0
    }
  ],
  "total": 100,
  "page": 1,
  "page_size": 50
}
```

**Notes:**
- Product cards are expanded with full product details
- Requires WordPress credentials

#### GET /api/v2/stores/{store_id}/upsell-combos/{combo_id}

Get upsell combo with expanded cards.

**Authentication:** Not required

**Response:** Single combo object (same structure as list item)

#### POST /api/v2/stores/{store_id}/upsell-combos

Create upsell combo.

**Authentication:** Not required

**Request Body:**
```json
{
  "main_product_id": 123,
  "recommended_product_ids": [124, 125],
  "discount_rules": [...],
  "enabled": true,
  "priority": 0
}
```

**Response:** Same as GET endpoint

#### PATCH /api/v2/stores/{store_id}/upsell-combos/{combo_id}

Update upsell combo (partial update).

**Authentication:** Not required

**Request Body:** (all fields optional)
```json
{
  "recommended_product_ids": [124, 125, 126],
  "enabled": false
}
```

**Response:** Same as GET endpoint

#### DELETE /api/v2/stores/{store_id}/upsell-combos/{combo_id}

Delete upsell combo.

**Authentication:** Not required

**Response:**
```json
{
  "ok": true
}
```

### BMSM Rules (v2)

#### GET /api/v2/stores/{store_id}/bmsm-rules

List BMSM rules with expanded product cards.

**Authentication:** Not required

**Query Parameters:**
- `page` (integer, default: 1): Page number
- `page_size` (integer, default: 50, max: 100): Items per page
- `search` (string, default: ""): Search query
- `filter` (string, default: "all"): Filter type

**Response:**
```json
{
  "items": [
    {
      "product_id": 123,
      "product": {
        "id": 123,
        "name": "Product Name",
        "sku": "SKU123",
        "price": "29.99",
        "image": {...}
      },
      "rules": {
        "enabled": true,
        "rules": [
          {
            "min_qty": 2,
            "discount_type": "percent",
            "discount_value": 10.0
          }
        ]
      }
    }
  ],
  "total": 100,
  "page": 1,
  "page_size": 50
}
```

**Notes:**
- Product cards are expanded with full product details
- Requires WordPress credentials

#### GET /api/v2/stores/{store_id}/bmsm-rules/{rule_id}

Get BMSM rule with expanded card.

**Authentication:** Not required

**Response:** Single rule object (same structure as list item)

#### POST /api/v2/stores/{store_id}/bmsm-rules

Create BMSM rule.

**Authentication:** Not required

**Request Body:**
```json
{
  "product_id": 123,
  "rules": {
    "enabled": true,
    "rules": [
      {
        "min_qty": 2,
        "discount_type": "percent",
        "discount_value": 10.0
      }
    ]
  }
}
```

**Response:** Same as GET endpoint

#### PATCH /api/v2/stores/{store_id}/bmsm-rules/{rule_id}

Update BMSM rule (partial update).

**Authentication:** Not required

**Request Body:** (all fields optional)
```json
{
  "rules": {
    "enabled": false
  }
}
```

**Response:** Same as GET endpoint

#### DELETE /api/v2/stores/{store_id}/bmsm-rules/{rule_id}

Delete BMSM rule.

**Authentication:** Not required

**Response:**
```json
{
  "ok": true
}
```

### Description Builder (v2)

#### POST /api/v2/stores/{store_id}/desc-builder/upload-zip

Upload ZIP file and scan for leaf folders.

**Authentication:** Required (`X-Store-Key`)

**Request:** Multipart form data with `file` field

**Response:**
```json
{
  "upload_id": "550e8400-e29b-41d4-a716-446655440000",
  "upload_token": "abc123...",
  "root_name": "Products",
  "multiple_roots": false,
  "zip_size": 1048576,
  "items": [
    {
      "id": "item-1",
      "rel_path": "Products/Category/Product1",
      "title": "Product1",
      "category": "Category",
      "has_description": false
    }
  ],
  "summary": {
    "total_items": 50,
    "categories": 10
  }
}
```

**Notes:**
- Maximum file size: 150MB
- Rate limited: one upload per store at a time
- Upload session expires after 24 hours

#### GET /api/v2/stores/{store_id}/desc-builder/presets

List all available presets.

**Authentication:** Required (`X-Store-Key`)

**Response:**
```json
{
  "presets": [
    {
      "category_key": "saddle",
      "display_name": "Saddle",
      "product_type": "Saddle",
      "fit": "Horse",
      "use": "Riding",
      "seo_keywords": ["saddle", "horse", "riding"]
    }
  ],
  "default_template": "Default template text..."
}
```

#### GET /api/v2/stores/{store_id}/desc-builder/presets/{category_key}

Get preset by category key.

**Authentication:** Required (`X-Store-Key`)

**Response:**
```json
{
  "category_key": "saddle",
  "display_name": "Saddle",
  "product_type": "Saddle",
  "fit": "Horse",
  "use": "Riding",
  "seo_keywords": ["saddle", "horse", "riding"]
}
```

#### POST /api/v2/stores/{store_id}/desc-builder/preview

Preview description for a single leaf folder.

**Authentication:** Required (`X-Store-Key`)

**Request Body:**
```json
{
  "upload_id": "550e8400-e29b-41d4-a716-446655440000",
  "upload_token": "abc123...",
  "rel_path": "Products/Category/Product1",
  "config": {
    "preset_key": "saddle",
    "template": "Custom template...",
    "overwrite": false
  }
}
```

**Response:**
```json
{
  "text": "Generated description text..."
}
```

**Notes:**
- Requires valid upload session (upload_token)
- Generates description without saving

#### POST /api/v2/stores/{store_id}/desc-builder/generate

Generate descriptions for selected leaf folders (background job).

**Authentication:** Required (`X-Store-Key`)

**Request Body:**
```json
{
  "upload_id": "550e8400-e29b-41d4-a716-446655440000",
  "upload_token": "abc123...",
  "rel_paths": [
    "Products/Category/Product1",
    "Products/Category/Product2"
  ],
  "config": {
    "preset_key": "saddle",
    "template": "Custom template...",
    "overwrite": false
  },
  "overwrite": false
}
```

**Response:**
```json
{
  "job_id": "660e8400-e29b-41d4-a716-446655440001",
  "job_token": "def456..."
}
```

**Notes:**
- Creates background job
- Rate limited: one job per store at a time
- Use SSE endpoint to track progress
- Download ZIP patch when job completes

#### GET /api/v2/stores/{store_id}/desc-builder/download/{job_id}

Download ZIP patch for completed job.

**Authentication:** Job token required (query parameter)

**Query Parameters:**
- `token` (string, required): Job token

**Response:** ZIP file download

**Notes:**
- ZIP contains only modified description files
- Can be applied to original ZIP to update descriptions

### Feeds (v2)

#### POST /api/v2/stores/{store_id}/feeds/jobs

Create a feed generation job.

**Authentication:** Required (`X-Store-Key`)

**Headers:**
- `X-Store-Key` (required): Store API key
- `X-Client-Session` (optional): Client session ID for multi-user isolation

**Request Body:**
```json
{
  "channel": "gmc",
  "filters": {
    "category_id": 1,
    "after_date": "2024-01-01T00:00:00Z",
    "product_limit": 1000,
    "product_ids": null
  },
  "defaults": {
    "google_category": "Apparel & Accessories > Clothing > Shirts & Tops",
    "product_type": "Shirt",
    "gender": "Unisex",
    "age_group": "adult"
  },
  "export": {
    "xml": true,
    "sheets": false,
    "sheets_config": null
  }
}
```

**Channels:**
- `gmc`: Google Merchant Center
- `bing`: Bing Shopping
- `both`: Both formats

**Response:**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "sse_url": "https://api.example.com/api/v2/stores/my-store/feeds/jobs/550e8400.../events?token=abc123...",
  "download_url": "https://api.example.com/api/v2/stores/my-store/feeds/jobs/550e8400.../download",
  "token": "abc123..."
}
```

**Notes:**
- `google_category` is required
- Job runs in background
- Use SSE endpoint to track progress
- Download file when job completes

#### GET /api/v2/stores/{store_id}/feeds/jobs

List feed jobs for a store.

**Authentication:** Required (`X-Store-Key`)

**Headers:**
- `X-Client-Session` (optional): Filter jobs by client session

**Query Parameters:**
- `limit` (integer, default: 50, max: 100): Maximum number of jobs to return

**Response:**
```json
[
  {
    "job_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "done",
    "channel": "gmc",
    "filename": "google_shopping_feed_20240115.zip",
    "size": 1048576,
    "items_count": 500,
    "started_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:35:00Z"
  }
]
```

**Notes:**
- Jobs are sorted by creation time (newest first)
- If `X-Client-Session` provided, only returns jobs for that session

#### GET /api/v2/stores/{store_id}/feeds/jobs/{job_id}

Get feed job details.

**Authentication:** Required (`X-Store-Key`)

**Headers:**
- `X-Client-Session` (optional): Must match job's client session

**Query Parameters:**
- `client_session` (optional): Alternative way to provide client session

**Response:**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "store_id": "my-store",
  "job_type": "feed-generation",
  "status": "done",
  "progress": {
    "done": 500,
    "total": 500,
    "percent": 100
  },
  "metrics": {
    "success": 500,
    "failed": 0,
    "retried": 0,
    "skipped": 0
  },
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:35:00Z",
  "outputs": {
    "zip_path": "/data/feeds/my-store/550e8400.../feed.zip",
    "zip_filename": "google_shopping_feed_20240115.zip"
  },
  "items_count": 500
}
```

**Error Responses:**
- `401`: Missing client session (if job requires it)
- `403`: Client session mismatch
- `404`: Job not found or store mismatch

#### GET /api/v2/stores/{store_id}/feeds/jobs/{job_id}/events

Stream feed job events via SSE.

**Authentication:** Job token required (query parameter)

**Query Parameters:**
- `token` (string, optional): Job token (preferred)
- `client_session` (string, optional): Client session (alternative authentication)

**Headers:**
- `X-Client-Session` (optional): Client session (alternative to query param)
- `Last-Event-ID` (optional): Resume from specific event

**Response:** `text/event-stream`

**Notes:**
- Token is preferred but optional if client session matches
- Client session must match job's session (if job has one)
- Same event format as v1 SSE endpoint

#### GET /api/v2/stores/{store_id}/feeds/jobs/{job_id}/download

Download feed XML/ZIP file.

**Authentication:** Required (`X-Store-Key`)

**Headers:**
- `X-Client-Session` (optional): Must match job's client session

**Query Parameters:**
- `client_session` (optional): Alternative way to provide client session

**Response:** File download (XML or ZIP)

**Notes:**
- Returns ZIP if both channels selected, XML if single channel
- File is available only after job completes successfully
- Client session must match job's session (if job has one)

## 7. Job / Async / SSE APIs

The backend uses a job-based architecture for long-running operations. Jobs are created via POST endpoints and tracked via GET endpoints and SSE streams.

### Job Lifecycle

1. **Creation**: Client POSTs to job creation endpoint, receives `job_id` and `job_token`
2. **Queued**: Job is added to background task queue
3. **Running**: Job executes in background
4. **Done/Failed/Cancelled**: Job completes with final status

### Job Status Values

- `queued`: Job is queued, not started
- `running`: Job is currently executing
- `done`: Job completed successfully
- `failed`: Job failed with errors
- `cancelled`: Job was cancelled

### Job Progress Tracking

Jobs emit progress updates via:
1. **Polling**: GET `/api/v1/stores/{store_id}/jobs/{job_id}` returns current status
2. **SSE Stream**: GET `/api/v1/stores/{store_id}/jobs/{job_id}/events?token={job_token}` streams real-time events

### SSE Event Types

- `connected`: Connection established
- `snapshot`: Current job state snapshot (sent immediately on connect)
- `log`: Log message with level (info, success, warning, error)
- `progress`: Progress update (done, total, success, failed)
- `status`: Status change (queued, running, done, failed, cancelled)
- `error`: Error event (stream ends)

### Job Token Security

- Job tokens are generated when job is created
- Tokens are required for SSE access
- Tokens provide access control without requiring store key
- Tokens are stored in Redis and verified on each SSE request

### Client Session (Multi-User Safety)

Some endpoints (feeds API) support `X-Client-Session` header for multi-user isolation:

- Each client generates a unique session ID
- Session ID is stored with job when created
- Job access is restricted to clients with matching session ID
- Prevents users from accessing each other's jobs

### Job Ownership Rules

- Jobs belong to the store specified in URL path
- Jobs can optionally belong to a client session
- Store ID mismatch returns 404 (security through obscurity)
- Session mismatch returns 403 Forbidden

### Job Control

- **Pause**: POST `/api/v1/stores/{store_id}/jobs/{job_id}/pause` - Pauses job at next checkpoint
- **Resume**: POST `/api/v1/stores/{store_id}/jobs/{job_id}/resume` - Resumes paused job
- **Cancel**: POST `/api/v1/stores/{store_id}/jobs/{job_id}/cancel` - Cancels job (cannot resume)

### Background Task Execution

- Jobs run in FastAPI background tasks
- Tasks are non-blocking and execute asynchronously
- Redis is used for job state persistence
- Job state persists across server restarts (stored in Redis)
- Jobs can be paused, resumed, or cancelled via control endpoints
- Job progress is tracked in real-time via SSE streams

## 8. File / Upload / External Service APIs

### File Upload Endpoints

#### Description Builder Upload

**POST /api/v2/stores/{store_id}/desc-builder/upload-zip**

Upload ZIP file for description generation.

**Authentication:** Required (`X-Store-Key`)

**Request:** Multipart form data with `file` field

**Limits:**
- Maximum file size: 150MB
- Rate limit: Maximum 3 concurrent uploads per store
- Upload session expires after 24 hours

**Response:**
```json
{
  "upload_id": "550e8400-e29b-41d4-a716-446655440000",
  "upload_token": "abc123...",
  "root_name": "Products",
  "multiple_roots": false,
  "zip_size": 1048576,
  "items": [...],
  "summary": {
    "total_items": 50,
    "categories": 10
  }
}
```

**Error Responses:**
- `413 Request Entity Too Large`: File exceeds 150MB limit
- `429 Too Many Requests`: Maximum concurrent uploads reached
- `400 Bad Request`: Empty file or invalid format

#### Category Image Upload

**POST /api/v1/stores/{store_id}/categories/{category_id}/image/upload**

Upload image for a category.

**Authentication:** Not required

**Request:** Multipart form data with `file` field

**Notes:**
- Requires WordPress credentials configured
- File is uploaded to WordPress media library
- Image is automatically assigned to category

#### Product Editor Image Upload

**POST /api/v1/stores/{store_id}/products/editor/{product_id}/images/upload**

Upload images for product editor.

**Authentication:** Not required

**Request:** Multipart form data with `files` field (multiple files)

**Response:**
```json
[
  {
    "id": 456,
    "src": "https://example.com/image.jpg",
    "alt": "Image alt",
    "position": 0,
    "delete_from_media": false
  }
]
```

**Notes:**
- Requires WordPress credentials
- Multiple files can be uploaded in single request
- Images are added to product gallery

#### Review Image Upload

**POST /api/v1/stores/{store_id}/reviews/{review_id}/images**

Upload images for a review.

**Authentication:** Not required

**Request:** Multipart form data with `files` field (multiple files)

**Response:**
```json
{
  "success": true,
  "message": "Uploaded and attached 2 image(s)",
  "images": [
    {
      "id": 456,
      "src": "https://example.com/image.jpg",
      "alt": "Review image"
    }
  ]
}
```

**Notes:**
- Requires WordPress credentials
- Images are attached to review via custom endpoint

### Image Proxying

#### GET /api/v1/img

Proxy and resize images with SSRF protection.

**Authentication:** Not required

**Query Parameters:**
- `u` (string, required): Image URL
- `w` (integer, default: 240, min: 1, max: 2000): Width
- `h` (integer, default: 240, min: 1, max: 2000): Height

**Response:** Image file (WebP or JPEG)

**Security:**
- Blocks private IP addresses (127.0.0.1, 10.x.x.x, 172.16-31.x.x, 192.168.x.x)
- Validates against allowed domains (if `ALLOW_IMAGE_DOMAINS` configured)
- Converts to WebP format (fallback to JPEG)
- Images cached for 1 day

**Error Responses:**
- `400 Bad Request`: Invalid URL
- `403 Forbidden`: Private IP or domain not allowed
- `502 Bad Gateway`: Error fetching image

**Notes:**
- Maximum dimensions: 2000x2000
- Images are cached server-side

### External Service Integrations

The backend integrates with the following external services:

1. **WooCommerce REST API**: Product, category, and order management
2. **WordPress REST API**: Media uploads, custom endpoints (FBT, BMSM)
3. **Redis**: Job state management and event streaming
4. **Google Sheets API**: Feed export (optional, requires credentials)

No other external services are directly exposed via the API.

## 9. Data Models

### Common Models

#### HealthResponse

```json
{
  "ok": boolean
}
```

#### ErrorResponse

```json
{
  "detail": string
}
```

### Store Models

#### StoreSummary

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Store ID (URL-safe slug) |
| `name` | string | Yes | Store display name |
| `store_url` | string | Yes | Store URL |
| `has_wc_keys` | boolean | Yes | Whether WooCommerce keys are configured |
| `has_wp_creds` | boolean | Yes | Whether WordPress credentials are configured |

#### StoreDetail

Extends `StoreSummary` with:
- `is_active`: boolean - Whether this is the active store
- `api_key`: string - Store API key (only returned in detail view)

#### StoreCreateRequest

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Store display name |
| `store_url` | string | Yes | Store URL (must start with http:// or https://) |
| `consumer_key` | string | Yes | WooCommerce consumer key |
| `consumer_secret` | string | Yes | WooCommerce consumer secret |
| `wp_username` | string | No | WordPress username |
| `wp_app_password` | string | No | WordPress app password |
| `set_as_active` | boolean | No | Set as active store (default: false) |

#### StoreUpdateRequest

All fields optional. Same structure as `StoreCreateRequest`.

### Product Models

#### ProductSummary (v1)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes | Product ID |
| `name` | string | Yes | Product name |
| `type` | string | Yes | Product type (simple, variable, etc.) |
| `status` | string | Yes | Product status (publish, draft, etc.) |
| `price` | string | Yes | Product price |
| `stock_status` | string | Yes | Stock status (instock, outofstock, etc.) |
| `variations_count` | integer | No | Number of variations (for variable products) |
| `image` | ImageInfo | Yes | Product image |

#### ProductCard (v2)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes | Product ID |
| `type` | string | Yes | Product type (simple, variable) |
| `title` | string | Yes | Product title |
| `image_url` | string | No | Product image URL |
| `sku` | string | No | Product SKU |
| `price` | string | No | Product price |

#### ProductDetail (v1)

Extends `ProductSummary` with:
- `sku`: string
- `regular_price`: string
- `sale_price`: string
- `stock_quantity`: integer
- `short_description`: string
- `description`: string
- `gallery`: array of ImageInfo
- `meta_data`: array of objects

#### ImageInfo

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | No | Image ID |
| `src` | string | Yes | Image URL |
| `alt` | string | No | Image alt text |

### Category Models

#### CategoryNode

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes | Category ID |
| `name` | string | Yes | Category name |
| `parent` | integer | Yes | Parent category ID (0 for root) |
| `count` | integer | Yes | Number of products in category |
| `level` | integer | Yes | Depth level (0 for root) |
| `full_path` | string | Yes | Full category path (e.g., "Parent > Child") |
| `image_id` | integer | No | Category image ID |
| `image_src` | string | No | Category image URL |
| `slug` | string | Yes | Category slug |
| `description` | string | Yes | Category description |
| `children` | array | Yes | Child categories (nested) |

#### CategoryCreateRequest

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Category name |
| `parent` | integer | No | Parent category ID (default: 0) |
| `description` | string | No | Category description |
| `slug` | string | No | Category slug (auto-generated if not provided) |
| `image_id` | integer | No | Category image ID |

### Job Models

#### JobProgress

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `done` | integer | Yes | Number of items processed |
| `total` | integer | Yes | Total number of items |
| `percent` | integer | Yes | Completion percentage (0-100) |

#### JobMetrics

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `success` | integer | Yes | Number of successful operations |
| `failed` | integer | Yes | Number of failed operations |
| `retried` | integer | Yes | Number of retried operations |
| `skipped` | integer | Yes | Number of skipped operations |

#### JobCurrent

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `product_id` | integer | No | Current product ID being processed |
| `action` | string | No | Current action (e.g., "updating", "deleting") |

#### JobResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `job_id` | string | Yes | Job ID (UUID) |
| `store_id` | string | No | Store ID |
| `job_type` | string | No | Job type |
| `status` | string | Yes | Job status (queued, running, done, failed, cancelled) |
| `progress` | JobProgress | No | Progress information |
| `metrics` | JobMetrics | No | Metrics information |
| `current` | JobCurrent | No | Current operation |
| `created_at` | string | No | Creation timestamp (ISO 8601) |
| `updated_at` | string | No | Last update timestamp (ISO 8601) |
| `outputs` | object | No | Job outputs (file paths, etc.) |
| `items_count` | integer | No | Number of items processed |

#### JobCreateResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `job_id` | string | Yes | Job ID (UUID) |
| `job_token` | string | Yes | Job token for SSE access |
| `status` | string | Yes | Initial status (always "queued") |

### Feed Models

#### FeedFilters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `category_id` | integer | No | Filter by WooCommerce category ID |
| `after_date` | datetime | No | Filter products modified after this date (ISO 8601) |
| `product_limit` | integer | No | Maximum number of products (0 = no limit) |
| `product_ids` | array of integers | No | Specific product IDs to include |

#### FeedDefaults

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `google_category` | string | Yes | Google Shopping category (required) |
| `product_type` | string | No | Default product type |
| `gender` | string | No | Gender (male, female, unisex) |
| `age_group` | string | No | Age group (newborn, infant, toddler, kids, adult) |

#### FeedExportOptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `xml` | boolean | Yes | Export as XML (default: true) |
| `sheets` | boolean | Yes | Export to Google Sheets (default: false) |
| `sheets_config` | SheetsConfig | No | Google Sheets configuration (required if sheets=true) |

#### SheetsConfig

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sheet_id` | string | No | Google Sheet ID |
| `tab_name` | string | No | Tab name |
| `credentials_json_base64` | string | No | Base64-encoded Google service account credentials JSON |

#### FeedJobCreate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `channel` | string | Yes | Channel (gmc, bing, both) |
| `filters` | FeedFilters | Yes | Product filters |
| `defaults` | FeedDefaults | Yes | Default values |
| `export` | FeedExportOptions | Yes | Export options |

#### FeedJobResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `job_id` | string | Yes | Job ID (UUID) |
| `status` | string | Yes | Job status (always "queued" on creation) |
| `sse_url` | string | Yes | SSE events URL |
| `download_url` | string | Yes | Download URL (available after completion) |
| `token` | string | No | Job token for SSE access |

### Description Builder Models

#### LeafItem

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Stable hash of rel_path |
| `rel_path` | string | Yes | Leaf folder path relative to root |
| `title` | string | Yes | Folder name (title) |
| `category` | string | No | Category from parent folder |
| `has_description` | boolean | Yes | Whether ZIP contains description.txt |

#### UploadZipResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `upload_id` | string | Yes | Upload session ID (UUID) |
| `upload_token` | string | Yes | Upload token for subsequent requests |
| `root_name` | string | No | Detected root folder name |
| `multiple_roots` | boolean | Yes | Whether ZIP has multiple root folders |
| `zip_size` | integer | Yes | ZIP file size in bytes |
| `items` | array of LeafItem | Yes | List of leaf folders found |
| `summary` | object | Yes | Summary statistics (total_items, categories) |

#### DescBuilderConfig

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `preset` | object | No | Preset overrides (product_type, fit, use, seo_keywords) |
| `template` | string | No | Description template with placeholders |
| `anchors` | object | No | Anchor keywords (keywords: string[] or string) |
| `anchor_options` | object | No | Anchor options (append_to_keywords, append_as_bullet, append_at_end) |

#### PreviewRequest

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `upload_id` | string | Yes | Upload session ID |
| `upload_token` | string | Yes | Upload token |
| `rel_path` | string | Yes | Relative path of leaf folder to preview |
| `config` | DescBuilderConfig | Yes | Configuration |

#### PreviewResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | Rendered description text |

#### GenerateRequest

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `upload_id` | string | Yes | Upload session ID |
| `upload_token` | string | Yes | Upload token |
| `rel_paths` | array of strings | Yes | List of rel_paths to generate |
| `config` | DescBuilderConfig | Yes | Configuration |
| `overwrite` | boolean | Yes | Whether to overwrite existing descriptions (default: true) |

#### GenerateResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `job_id` | string | Yes | Background job ID (UUID) |
| `job_token` | string | Yes | Job token for SSE and download access |

#### PresetInfo

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `category_key` | string | Yes | Category key (normalized) |
| `display_name` | string | Yes | Display name for category |
| `product_type` | string | Yes | Product type |
| `fit` | string | Yes | Fit |
| `use` | string | Yes | Use |
| `seo_keywords` | array of strings | Yes | SEO keywords |

### BMSM Models

#### BMSMRuleSchema (v1)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `min` | integer | Yes | Minimum quantity (must be >= 2) |
| `rate` | float | Yes | Discount rate as decimal (0.05 = 5%, max 0.95) |

#### BMSMRulesSchema (v1)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `enabled` | boolean | Yes | Whether BMSM is enabled |
| `rules` | array of BMSMRuleSchema | Yes | Discount rules |

#### BmsmTier (v2)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `min_qty` | integer | Yes | Minimum quantity |
| `discount_type` | string | Yes | Discount type (percent, fixed) |
| `discount_value` | float | Yes | Discount value |

#### BmsmRule (v2)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `product_id` | integer | Yes | Product ID |
| `product` | ProductCard | No | Product card (expanded) |
| `rules` | object | Yes | Rules object (enabled, rules array) |

### FBT/Upsell Combo Models

#### DiscountRuleSchema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `min` | integer | Yes | Minimum quantity |
| `rate` | float | Yes | Discount rate as decimal (0.05 = 5%) |

#### UpsellCombo (v2)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `combo_id` | integer | Yes | Combo ID (main product ID) |
| `main_product` | ProductCard | No | Main product card (expanded) |
| `recommended_products` | array of ProductCard | No | Recommended products (expanded) |
| `discount_rules` | array of DiscountRuleSchema | Yes | Discount rules |
| `enabled` | boolean | Yes | Whether combo is enabled |
| `priority` | integer | Yes | Priority (higher = shown first) |
| `apply_scope` | string | Yes | Apply scope (main_only, all_in_combo) |

#### UpsellComboCreate (v2)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `main_product_id` | integer | Yes | Main product ID |
| `recommended_product_ids` | array of integers | Yes | Recommended product IDs |
| `discount_rules` | array of DiscountRuleSchema | No | Discount rules |
| `enabled` | boolean | No | Whether combo is enabled (default: true) |
| `priority` | integer | No | Priority (default: 0) |

### Review Models

#### ReviewCreateRequest

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `product_id` | integer | Yes | Product ID |
| `reviewer` | string | Yes | Reviewer name |
| `reviewer_email` | string | Yes | Reviewer email |
| `rating` | integer | Yes | Rating (1-5) |
| `review_text` | string | Yes | Review text |
| `image_urls` | array of strings | No | Image URLs to upload with review |

#### ReviewResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes | Review ID |
| `product_id` | integer | Yes | Product ID |
| `product_name` | string | Yes | Product name |
| `reviewer` | string | Yes | Reviewer name |
| `reviewer_email` | string | Yes | Reviewer email |
| `rating` | integer | Yes | Rating (1-5) |
| `review_text` | string | Yes | Review text |
| `status` | string | Yes | Review status (approved, pending, etc.) |
| `date_created` | string | Yes | Creation date (ISO 8601) |
| `images` | array of objects | Yes | Review images (id, src, alt) |

## 10. Security Considerations

### Authentication

- **Store-based authentication**: Each store has an API key configured in `woo_config.json`
- **X-Store-Key header**: Required for protected endpoints
- **Job tokens**: Used for SSE access control (64-character hex strings)
- **Upload tokens**: Used for description builder upload sessions (64-character hex strings)
- **Client sessions**: Optional multi-user isolation via `X-Client-Session` header

### Rate Limiting

**Description Builder:**
- Maximum 3 concurrent uploads per store
- Maximum 2 concurrent generation jobs per store
- Rate limit enforced via Redis counters
- Returns `429 Too Many Requests` when limit exceeded

**Other endpoints:**
- No rate limiting currently implemented
- Recommended: Implement rate limiting at reverse proxy level for production

### SSRF Protection

**Image Proxy (`/api/v1/img`):**
- Blocks private IP addresses (127.0.0.1, 10.x.x.x, 172.16-31.x.x, 192.168.x.x)
- Validates against allowed domains (if `ALLOW_IMAGE_DOMAINS` configured)
- Prevents server-side request forgery attacks

### Secret Handling

- Secrets (consumer_secret, wp_app_password, api_key) are never logged
- Secrets are filtered from API responses
- Store keys are stored in `woo_config.json` (should be secured in production)
- Job tokens and upload tokens are cryptographically random (secrets.token_hex)

### Trust Boundaries

**Client Responsibility:**
- Generate and manage client session IDs
- Store job tokens securely
- Handle authentication errors gracefully
- Validate responses before displaying to users

**Server Responsibility:**
- Verify store keys on protected endpoints
- Validate job tokens for SSE access
- Enforce rate limits
- Sanitize all user inputs
- Prevent SSRF attacks

### Abuse Prevention

- Job tokens are required for SSE access (prevents unauthorized job monitoring)
- Client sessions isolate multi-user access (prevents cross-user job access)
- Upload sessions expire after 24 hours
- File size limits prevent resource exhaustion (150MB for ZIP uploads)

## 11. Environment Configuration

### Required Environment Variables

None. The backend can run with default configuration.

### Optional Environment Variables

| Variable | Default | Description |
|---------|---------|-------------|
| `WOO_CONFIG_PATH` | `./woo_config.json` | Path to store configuration file |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection URL |
| `ALLOW_IMAGE_DOMAINS` | `None` | Comma-separated list of allowed image domains (for SSRF protection) |
| `LOG_LEVEL` | `INFO` | Logging level (DEBUG, INFO, WARNING, ERROR) |
| `DATA_DIR` | System temp directory | Base directory for temporary files (description builder, feeds) |
| `API_BASE_URL` | `http://localhost:8000` | Base URL for generating SSE and download URLs |

### Configuration File

**woo_config.json** (required):

```json
{
  "active": "Store Name",
  "stores": {
    "Store Name": {
      "store_url": "https://example.com",
      "consumer_key": "ck_...",
      "consumer_secret": "cs_...",
      "wp_username": "user",
      "wp_app_password": "xxxx xxxx xxxx xxxx",
      "api_key": "generated_key..."
    }
  }
}
```

**Fields:**
- `active`: Name of active store (optional)
- `stores`: Object mapping store names to configurations
  - `store_url`: Store URL (required, must start with http:// or https://)
  - `consumer_key`: WooCommerce consumer key (required)
  - `consumer_secret`: WooCommerce consumer secret (required)
  - `wp_username`: WordPress username (optional)
  - `wp_app_password`: WordPress app password (optional)
  - `api_key`: Store API key (auto-generated if not provided)

### Redis Configuration

Redis is required for:
- Job state management
- SSE event streaming
- Rate limiting (description builder)
- Upload session storage

**Connection:**
- Default: `redis://localhost:6379/0`
- Configure via `REDIS_URL` environment variable
- Redis must be running and accessible

### Data Directory

**Default:** System temporary directory

**Usage:**
- Description builder: `{DATA_DIR}/desc_builder/{store_id}/{upload_id}/`
- Feed generation: `/data/feeds/{store_id}/{job_id}/` (hardcoded, should be configurable)

**Recommendation:** Mount persistent volume in Docker for production.

## 12. Example Integration Flow

### Example 1: Creating and Monitoring a Feed Generation Job

**Step 1: Create Feed Job**

```http
POST /api/v2/stores/my-store/feeds/jobs
X-Store-Key: abc123...
X-Client-Session: session-xyz-789
Content-Type: application/json

{
  "channel": "gmc",
  "filters": {
    "category_id": 1,
    "product_limit": 1000
  },
  "defaults": {
    "google_category": "Apparel & Accessories > Clothing > Shirts & Tops",
    "product_type": "Shirt",
    "gender": "Unisex"
  },
  "export": {
    "xml": true,
    "sheets": false
  }
}
```

**Response:**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "sse_url": "https://api.example.com/api/v2/stores/my-store/feeds/jobs/550e8400.../events?token=def456...",
  "download_url": "https://api.example.com/api/v2/stores/my-store/feeds/jobs/550e8400.../download",
  "token": "def456..."
}
```

**Step 2: Connect to SSE Stream**

```javascript
const eventSource = new EventSource(
  `https://api.example.com/api/v2/stores/my-store/feeds/jobs/550e8400.../events?token=def456...`
);

eventSource.addEventListener('connected', (e) => {
  console.log('Connected to job stream');
});

eventSource.addEventListener('progress', (e) => {
  const data = JSON.parse(e.data);
  console.log(`Progress: ${data.done}/${data.total} (${data.percent}%)`);
});

eventSource.addEventListener('status', (e) => {
  const data = JSON.parse(e.data);
  if (data.status === 'done') {
    console.log('Job completed!');
    eventSource.close();
  }
});

eventSource.addEventListener('error', (e) => {
  console.error('SSE error:', e);
  eventSource.close();
});
```

**Step 3: Download Feed File**

```http
GET /api/v2/stores/my-store/feeds/jobs/550e8400.../download
X-Store-Key: abc123...
X-Client-Session: session-xyz-789
```

**Response:** ZIP file download (or XML if single channel)

### Example 2: Description Builder Workflow

**Step 1: Upload ZIP**

```http
POST /api/v2/stores/my-store/desc-builder/upload-zip
X-Store-Key: abc123...
Content-Type: multipart/form-data

file: <ZIP file>
```

**Response:**
```json
{
  "upload_id": "660e8400-e29b-41d4-a716-446655440001",
  "upload_token": "ghi789...",
  "root_name": "Products",
  "multiple_roots": false,
  "zip_size": 5242880,
  "items": [
    {
      "id": "item-1",
      "rel_path": "Products/Category/Product1",
      "title": "Product1",
      "category": "Category",
      "has_description": false
    }
  ],
  "summary": {
    "total_items": 50,
    "categories": 10
  }
}
```

**Step 2: Preview Description**

```http
POST /api/v2/stores/my-store/desc-builder/preview
X-Store-Key: abc123...
Content-Type: application/json

{
  "upload_id": "660e8400-e29b-41d4-a716-446655440001",
  "upload_token": "ghi789...",
  "rel_path": "Products/Category/Product1",
  "config": {
    "preset": {
      "product_type": "t-shirt",
      "fit": "unisex classic fit",
      "use": "everyday outfits",
      "seo_keywords": ["t-shirt", "graphic tee"]
    },
    "template": "{{title}} is a premium {{product_type}}..."
  }
}
```

**Response:**
```json
{
  "text": "Product1 is a premium t-shirt..."
}
```

**Step 3: Generate Descriptions**

```http
POST /api/v2/stores/my-store/desc-builder/generate
X-Store-Key: abc123...
Content-Type: application/json

{
  "upload_id": "660e8400-e29b-41d4-a716-446655440001",
  "upload_token": "ghi789...",
  "rel_paths": [
    "Products/Category/Product1",
    "Products/Category/Product2"
  ],
  "config": {
    "preset": {
      "product_type": "t-shirt"
    }
  },
  "overwrite": true
}
```

**Response:**
```json
{
  "job_id": "770e8400-e29b-41d4-a716-446655440002",
  "job_token": "jkl012..."
}
```

**Step 4: Monitor Job via SSE**

```javascript
const eventSource = new EventSource(
  `https://api.example.com/api/v1/stores/my-store/jobs/770e8400.../events?token=jkl012...`
);

eventSource.addEventListener('status', (e) => {
  const data = JSON.parse(e.data);
  if (data.status === 'done') {
    // Download ZIP patch
    downloadZipPatch('770e8400...', 'jkl012...');
  }
});
```

**Step 5: Download ZIP Patch**

```http
GET /api/v2/stores/my-store/desc-builder/download/770e8400...?token=jkl012...
```

**Response:** ZIP file containing only modified description files

### Example 3: Error Handling

**Scenario: Invalid Store Key**

```http
POST /api/v2/stores/my-store/feeds/jobs
X-Store-Key: invalid-key
Content-Type: application/json

{...}
```

**Response:**
```http
HTTP/1.1 403 Forbidden
X-Error-Code: invalid_store_key

{
  "detail": "Invalid X-Store-Key"
}
```

**Client Handling:**
```javascript
try {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Store-Key': storeKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    if (response.status === 403) {
      const errorCode = response.headers.get('X-Error-Code');
      if (errorCode === 'invalid_store_key') {
        // Show error: "Invalid store API key. Please check your configuration."
        return;
      }
    }
    const error = await response.json();
    throw new Error(error.detail);
  }
  
  const data = await response.json();
  // Handle success
} catch (error) {
  // Handle network errors, etc.
  console.error('Request failed:', error);
}
```

### Example 4: Pagination

**Request:**
```http
GET /api/v1/stores/my-store/products?page=1&per_page=50
```

**Response:**
```json
{
  "page": 1,
  "per_page": 50,
  "total": 150,
  "items": [...]
}
```

**Client Handling:**
```javascript
async function fetchProducts(page = 1, perPage = 50) {
  const response = await fetch(
    `/api/v1/stores/my-store/products?page=${page}&per_page=${perPage}`
  );
  const data = await response.json();
  
  // Render products
  renderProducts(data.items);
  
  // Update pagination UI
  updatePagination({
    currentPage: data.page,
    totalPages: Math.ceil(data.total / data.per_page),
    total: data.total
  });
}
```