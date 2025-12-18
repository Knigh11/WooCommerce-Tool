# WooCommerce Admin Frontend

React + Vite + TypeScript frontend for testing the WooCommerce Backend API.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure API base URL:**
   - Copy `.env.example` to `.env`
   - Update `VITE_API_BASE` if your backend runs on a different port:
     ```
     VITE_API_BASE=http://127.0.0.1:8000
     ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

   The app will be available at http://localhost:5173 (or the next available port).

## Features

### Products Tab
- Select a store from the dropdown
- Search products (debounced)
- Paginate through products
- Click a product row to view details in a modal
- View product images (WP Media or FIFU)
- See product metadata

### Jobs Tab
- Create three types of jobs:
  - **Delete Products**: Delete products by ID (with dry-run option)
  - **Update Prices**: Update prices by ID or search term (increase/decrease, percent/fixed)
  - **Bulk Update Fields**: Update title, descriptions for products
- Monitor job progress in real-time via SSE:
  - Progress bar
  - Success/failed/retried/skipped metrics
  - Real-time logs with auto-scroll
  - Cancel job button

### Diagnostics Tab
- View API base URL
- See selected store
- Monitor API call latencies:
  - Last API call duration
  - Average products list call duration (rolling 20)
  - Average job state poll duration (rolling 20)
- View last error

## Testing Workflow

1. **Select a store:**
   - Choose a store from the dropdown
   - Products will load automatically

2. **Test product search:**
   - Enter a search term
   - Results update after 300ms debounce

3. **Test job creation:**
   - Go to Jobs tab
   - Create a delete job with dry-run enabled:
     - Enter product IDs: `123, 456, 789`
     - Check "Dry Run"
     - Click "Create Job"
   - Job monitor opens automatically
   - Watch real-time logs and progress

4. **Test SSE reliability:**
   - Create a job with multiple products
   - Monitor the SSE connection indicator
   - Check events per minute counter
   - If SSE fails, polling fallback activates automatically

## API Endpoints Tested

- ✅ `GET /api/v1/stores` - List stores
- ✅ `GET /api/v1/stores/{store_id}/products` - List products with pagination
- ✅ `GET /api/v1/stores/{store_id}/products/{product_id}` - Get product details
- ✅ `POST /api/v1/stores/{store_id}/jobs/delete-products` - Create delete job
- ✅ `POST /api/v1/stores/{store_id}/jobs/update-prices` - Create price update job
- ✅ `POST /api/v1/stores/{store_id}/jobs/bulk-update-fields` - Create bulk update job
- ✅ `GET /api/v1/stores/{store_id}/jobs/{job_id}` - Get job status (polling)
- ✅ `POST /api/v1/stores/{store_id}/jobs/{job_id}/cancel` - Cancel job
- ✅ `GET /api/v1/stores/{store_id}/jobs/{job_id}/events` - SSE stream
- ✅ `GET /api/v1/img?u=...&w=...&h=...` - Image proxy

## Vite Proxy

The Vite dev server proxies `/api` requests to the backend to avoid CORS issues. Make sure your backend is running on the port specified in `VITE_API_BASE`.

## Notes

- All API calls are timed and displayed in the Diagnostics tab
- SSE automatically reconnects on errors
- Polling fallback ensures job monitoring works even if SSE fails
- Product IDs can be entered as comma, newline, or space-separated values
- Image thumbnails use the backend proxy endpoint
- No secrets are ever displayed in the UI

