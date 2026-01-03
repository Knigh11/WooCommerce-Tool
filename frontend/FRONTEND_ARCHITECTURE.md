# Frontend Architecture & Flow

## 1. Overview

The frontend is a React-based Single Page Application (SPA) for managing WooCommerce stores. It provides a web interface to interact with the WooCommerce backend API for product management, job execution, feed generation, and CSV import/export operations.

**Purpose:**
- Browse and manage WooCommerce products
- Execute batch operations (delete, price updates, bulk field updates)
- Generate CSV files from product folder structures with image organization
- Manage product feeds and offer rules
- Build product descriptions with templates

**Backend Relationship:**
- Communicates with backend API via REST endpoints (proxied through Vite dev server)
- Uses Server-Sent Events (SSE) for real-time job monitoring
- Does not store data locally; all persistence is backend-managed
- CSV Generator feature operates client-side only (no backend dependency)

**What It Does NOT Do:**
- Does not handle ZIP file extraction (CSV Generator only accepts folders)
- Does not store user sessions or authentication tokens
- Does not cache product data (uses React Query for API state management)

## 2. Tech Stack

**Framework & Language:**
- React 18.2.0 (functional components with hooks)
- TypeScript 5.2.2
- Vite 5.0.8 (build tool and dev server)

**Routing:**
- React Router DOM 6.20.0 (client-side routing)

**State Management:**
- TanStack React Query 5.14.2 (server state caching and synchronization)
- Zustand 4.4.7 (global client state: job manager)
- React Context API (store selection, theme)

**UI Libraries:**
- Tailwind CSS 3.3.6 (utility-first styling)
- Radix UI components (dialog, select, tabs, popover, checkbox, label)
- Lucide React 0.294.0 (icons)
- Framer Motion 10.16.16 (page transitions and animations)

**Forms & Validation:**
- React Hook Form 7.48.2
- Zod 3.22.4 (schema validation)
- @hookform/resolvers 3.3.2 (Zod integration)

**Internationalization:**
- i18next 23.7.6
- react-i18next 13.5.0
- i18next-browser-languagedetector 7.2.0

**Utilities:**
- clsx, tailwind-merge (CSS class utilities)
- class-variance-authority (component variants)
- next-themes 0.2.1 (theme switching)
- sonner 1.2.0 (toast notifications)

**Build & Dev Tooling:**
- ESLint with TypeScript plugin
- PostCSS with Autoprefixer
- Rollup Plugin Visualizer (bundle analysis)
- Manual code splitting configuration in vite.config.ts

## 3. Application Entry & Routing

**Entry Point:** `src/main.tsx`

Application initialization sequence:
1. Creates React root and mounts application
2. Wraps app in providers (nested order):
   - `QueryProvider` (TanStack Query client)
   - `ThemeProvider` (next-themes, system theme detection)
   - `StoreProvider` (store selection context)
   - `JobProvider` (job manager state)
3. Renders `App` component

**Routing Strategy:** `src/App.tsx`

- Uses `BrowserRouter` for client-side routing
- All routes are wrapped in `AppShell` layout component
- Pages are lazy-loaded for code splitting
- Each route uses `Suspense` with `LoadingState` fallback
- Root path (`/`) redirects to `/dashboard`

**Route Structure:**
```
/ → redirects to /dashboard
/dashboard → Dashboard page
/single → Single Product Editor
/update-prices → Price Editor
/bulk-fields → Bulk Fields Editor
/delete → Delete Products
/import-csv → CSV Import
/categories → Category Manager
/reviews → Reviews Manager
/jobs → Job Monitor
/settings → Settings
/offers/fbt → Upsell Combos (V2)
/offers/bmsm → BMSM Rules (V2)
/stores/:storeId/description-builder → Description Builder
/feeds → Feeds Manager
/csv-generator → CSV Generator (client-side only)
```

**Layout Component:** `src/components/app/AppShell.tsx`
- Provides sidebar navigation (`SidebarNav`)
- Top bar (`TopBar`)
- Main content area with page transitions (`AnimatedPageWrapper`)
- Job drawer (lazy-loaded when active)
- Job modal (for detailed job views)
- Toast notifications (`Toaster`)

## 4. Core User Flow

### CSV Generator Flow (Primary Client-Side Feature)

The CSV Generator is a complete client-side workflow that does not require backend connectivity:

**Step 1: Folder Selection**
- User selects a folder using one of two methods:
  - **File Input with `webkitdirectory`**: Standard file input with directory selection (all browsers)
  - **File System Access API**: `showDirectoryPicker()` (Chrome/Edge only, falls back to file input)
- Selected files are stored as `LocalFile[]` with relative paths preserved
- Each `LocalFile` contains: `{ path: string, file: File }`
- Path format: `"ProductA/1.jpg"` or `"ProductA/Style1/2.jpg"` (relative to selected root)

**Step 2: Scanning**
- `scanBaseFolder()` processes the `LocalFile[]` array
- Detects three product structure cases:
  - **CASE 1**: Images directly in root folder (base_root_image)
  - **CASE 2**: Product folders without style subfolders
  - **CASE 3**: Product folders with style subfolders
- Reads `Description.txt` files (case-insensitive) from each folder
- Classifies images as: `numbered` (1.jpg, 2.jpg), `extra` (p1.jpg, p2.jpg), or `other`
- Builds `ProductFolder[]` structure with sorted images and styles
- Displays scan summary: product count, style count, image count

**Step 3: Configuration**
- User configures generation parameters:
  - Colors (comma-separated, e.g., "Red, Blue, Green")
  - Sizes (comma-separated, e.g., "S, M, L, XL")
  - Base Price (number)
  - Step Price (number, added per size increment)
  - Image Mode: `parent_only` (first row only) or `per_variation` (every row)

**Step 3.5: Cloudinary Upload (Optional)**
- User enables upload checkbox
- Enters Cloudinary settings:
  - Cloud Name (required)
  - Unsigned Upload Preset (required)
  - Folder Prefix (default: "csvgen")
  - Concurrency (1-6, default: 4)
- Clicks "Upload Images" button
- Images are uploaded concurrently to Cloudinary
- Upload progress is displayed (uploaded/total/failed)
- Uploaded URLs are stored in `Map<path, secureUrl>`
- Failed uploads are collected and displayed

**Step 4: Generate Rows**
- User clicks "Generate Rows" button
- `buildRows()` processes `ProductFolder[]` with configuration
- Creates `CsvRow[]` following CASE branching rules
- Image resolver uses Cloudinary URLs if available, otherwise local paths
- Self-check function validates row counts by case
- Debug mode (optional checkbox) logs detailed information to console
- Generated row count is displayed

**Step 5: Download CSV**
- User clicks "Download CSV" button (only visible if rows exist)
- `rowsToCsv()` serializes rows to CSV string with UTF-8 BOM
- `downloadCsv()` creates Blob and triggers browser download
- Filename: `csv_generator_output.csv`

### Other Core Flows (Backend-Dependent)

**Product Browsing:**
1. User selects store from dropdown (persisted in localStorage)
2. Products list loads via API with pagination
3. User can search (debounced 300ms) and paginate
4. Clicking product row opens detail modal with images and metadata

**Job Execution:**
1. User creates job (delete/update-prices/bulk-fields) from Jobs page
2. Job is created via API POST request
3. Job monitor opens automatically with SSE connection
4. Real-time events update progress bar, metrics, and logs
5. If SSE fails, polling fallback activates
6. User can cancel job via API call

**Feed Generation:**
1. User selects products and configures feed settings
2. Feed job is created via API
3. Job progress is monitored via SSE or polling
4. Completed feeds can be downloaded or viewed

## 5. Data Flow & State Management

### CSV Generator State (Component-Level)

All CSV Generator state is local to `CsvGeneratorPage` component:

```typescript
// File selection
files: LocalFile[]
products: ProductFolder[]
scanSummary: { productCount, styleCount, imageCount } | null

// Generation configuration
colors: string
sizes: string
basePrice: string
stepPrice: string
imageMode: "parent_only" | "per_variation"

// Cloudinary upload state
cloudinaryCloudName: string
cloudinaryUploadPreset: string
cloudinaryFolderPrefix: string
uploadEnabled: boolean
uploadConcurrency: number
isUploading: boolean
uploadProgress: UploadProgress | null
uploadErrors: string[]
imageUrlByPath: Map<string, string>

// Generated data
rows: CsvRow[]
debugMode: boolean
```

**State Flow:**
1. `files` → `handleScan()` → `products` + `scanSummary`
2. `products` + config → `handleGenerate()` → `rows`
3. `products` + Cloudinary settings → `handleUpload()` → `imageUrlByPath`
4. `rows` + `imageUrlByPath` (via resolver) → `buildRows()` → updated `rows`
5. `rows` → `downloadCsv()` → browser download

### Global State (Context & Zustand)

**Store Context** (`src/state/storeContext.tsx`):
- `selectedStoreId: string | null` (persisted in localStorage)
- `stores: StoreSummary[]`
- Used across all pages for API calls

**Job Manager** (`src/state/jobManager.tsx` - Zustand store):
- `activeJobIds: string[]`
- `isDrawerOpen: boolean`
- `modalJobId: string | null`
- Manages job monitoring UI state globally

**Theme Context** (next-themes):
- System/light/dark theme preference
- Persisted in localStorage
- Applied via CSS class on `<html>`

### Server State (TanStack Query)

React Query manages all API data:
- Products list (paginated, cached)
- Product details (cached by ID)
- Stores list
- Job status (polled when SSE unavailable)
- Categories, feeds, etc.

**Query Configuration:**
- `staleTime: 60 seconds`
- `refetchOnWindowFocus: false`
- `retry: 1`

## 6. Core Modules & Responsibilities

### CSV Generator Modules (`src/csvgen/`)

**`types.ts`**
- TypeScript type definitions for CSV Generator
- `LocalFile`: `{ path: string, file: File }`
- `ImageFile`: `{ path, filename, ext, kind, number?, file }`
- `ImageKind`: `"numbered" | "extra" | "other"`
- `StyleFolder`: `{ name, description_text?, root_images, extra_images }`
- `ProductFolder`: `{ name, source, has_styles, description_text?, root_images, extra_images, styles }`
- `ProductSource`: `"base_root_image" | "product_folder"`
- `CsvRow`: `{ title, style, color, size, price, image, description }`
- `GeneratorConfig`: `{ colors, sizes, base_price, step_price, image_mode }`

**`scan.ts`**
- `scanBaseFolder(files: LocalFile[]): Promise<ProductFolder[]>`
- Scans folder structure and builds product hierarchy
- Detects CASE 1/2/3 structures
- Reads description files asynchronously
- Classifies images by filename pattern
- Returns sorted products

**`generate.ts`**
- `buildRows(products, config, resolveImage): CsvRow[]`
- Generates CSV rows following CASE branching rules
- `extractTitleFromImage()`: Extracts title from image filename (CASE 1 only)
- `selfCheck()`: Validates row counts by case
- `ImageResolver` type: Function to resolve image to URL/path

**`cloudinary.ts`**
- `collectImages(products): ImageFile[]` - De-duplicates images by path
- `uploadOne(imageFile, settings, retryCount): Promise<UploadResult>`
- `uploadImages(images, settings, concurrency, onProgress): Promise<Map<path, url>>`
- `sanitizePath(path): string` - Creates safe public_id
- Handles unsigned uploads with retry logic (exponential backoff)
- Concurrency control (1-6 concurrent uploads)

**`csv.ts`**
- `rowsToCsv(rows): string` - Serializes rows to CSV with UTF-8 BOM
- `downloadCsv(rows, filename): void` - Triggers browser download
- `escapeCsvField(value): string` - Escapes CSV fields (quotes, commas, newlines)

**`sort.ts`**
- `sortNumberedImages(images): ImageFile[]` - Sorts by number ascending
- `sortExtraImages(images): ImageFile[]` - Sorts pX images by number
- `sortOtherImages(images): ImageFile[]` - Lexicographic sort
- `sortStyles(styles): StyleFolder[]` - Alphabetical sort
- `sortProducts(products): ProductFolder[]` - base_root_image first, then alphabetical

### UI Components (`src/components/`)

**`CsvGeneratorPage.tsx`**
- Main component for CSV Generator feature
- Orchestrates all CSV Generator steps
- Manages all local state
- Handles file input and folder picker
- Renders step-by-step UI cards

**`app/AppShell.tsx`**
- Root layout component
- Provides sidebar, top bar, page transitions
- Manages job drawer and modal visibility
- Wraps all page routes

**`app/SidebarNav.tsx`**
- Navigation sidebar with route links
- Highlights active route

**`app/TopBar.tsx`**
- Store selector dropdown
- Theme toggle
- User info

**`ui/` (Radix UI wrappers)**
- Reusable UI components (Button, Card, Input, Dialog, Select, etc.)
- Styled with Tailwind CSS
- Follows shadcn/ui patterns

### API Modules (`src/api/`)

**`client.ts`**
- Base API fetch wrapper with error handling
- Handles proxy configuration
- Adds store authentication headers

**`endpoints.ts`**
- Centralized endpoint URL definitions
- Uses store ID parameters

**`types.ts`**
- TypeScript types for API responses

**`v2/`**
- Version 2 API modules (feeds, products, bmsm rules, upsell combos)

### State Management (`src/state/`)

**`storeContext.tsx`**
- React Context for store selection
- Persists selected store ID in localStorage
- Validates stored ID against available stores

**`jobManager.tsx`**
- Zustand store for job monitoring UI
- Tracks active jobs and drawer/modal state

### Hooks (`src/hooks/`)

Custom React hooks for data fetching and state:
- `useStores.ts` - Fetch stores list
- `useJobs.ts` - Job management
- `useJobEventsSSE.ts` - SSE connection for job events
- `useFeeds.ts` - Feed management
- `useStoreApiKey.ts` - Store API key management

## 7. Scanner Logic (IMPORTANT)

### Folder/ZIP Input Normalization

**No ZIP Support:** The CSV Generator does NOT handle ZIP files. It only accepts folder selection via:
1. HTML file input with `webkitdirectory` attribute
2. File System Access API (`showDirectoryPicker`)

**Path Preservation:**
- `webkitdirectory`: Paths are in `file.webkitRelativePath` (e.g., `"ProductA/1.jpg"`)
- File System Access API: Paths are constructed recursively as `"parent/child/file.jpg"`
- All paths are stored as-is in `LocalFile.path`
- Paths are NEVER truncated or modified during scanning

### Product Detection

**CASE 1: Base Root Images**
- Detected when images exist directly in root (no `/` in path, or single filename)
- Each root image becomes a separate `ProductFolder` with `source: "base_root_image"`
- Product name is extracted from image filename (stem, no extension)
- All root images share the same description (from root `Description.txt` if present)

**CASE 2: Product Folders Without Styles**
- Detected when a subdirectory contains images directly (no style subdirectories)
- Product name is the folder name
- Images in product folder are classified and sorted
- Description is read from `ProductName/Description.txt`

**CASE 3: Product Folders With Styles**
- Detected when a product folder contains subdirectories (style folders)
- Product name is the parent folder name
- Each style folder becomes a `StyleFolder` with its own images and description
- Style description is read from `ProductName/StyleName/Description.txt`
- Product-level description is ignored (styles have their own)

### Image Classification Rules

**`classifyImage(filename: string)` function:**

1. **Extra Images (`"extra"`)**: Filenames matching `/^p(\d+)$/i` (case-insensitive)
   - Examples: `p1.jpg`, `p2.jpg`, `p10.png`
   - Number extracted from match: `p1` → `number: 1`

2. **Numbered Images (`"numbered"`)**: Filenames matching `/^(\d+)\./` (before extension)
   - Examples: `1.jpg`, `2.jpg`, `10.png`
   - Number extracted: `1.jpg` → `number: 1`

3. **Other Images (`"other"`)**: All other filenames
   - Examples: `front.jpg`, `back.png`, `mockup.webp`, `product-image.jpg`
   - No number extracted

**Classification is case-insensitive for extra images (pX pattern), but exact match for numbered images.**

### Description File Detection

- Filename must be exactly `Description.txt` (case-insensitive comparison)
- Searched in each folder: root, product folders, style folders
- File content is read as text and trimmed
- Empty or missing descriptions result in `undefined` (not empty string)
- Description is stored in `description_text?: string` field

### Deterministic Sorting Rules

**Images:**
- Numbered images: Sorted by `number` field ascending (`1, 2, 3, ...`)
- Extra images: Sorted by `number` field ascending (`p1, p2, p3, ...`)
- Other images: Lexicographic sort (lowercased filename)

**Styles:**
- Alphabetical by name (lowercased)

**Products:**
- `base_root_image` products first (sorted by first image filename, numeric-aware)
- `product_folder` products second (alphabetical by name, lowercased)

**Image Grouping in Style Folders:**
- `root_images`: Numbered images + Other images (sorted separately, then combined)
- `extra_images`: Extra images only (pX pattern)

**Image Grouping in Product Folders (no styles):**
- `root_images`: Numbered images + Other images
- `extra_images`: Extra images only

## 8. Generator Logic (IMPORTANT)

### CASE Branching Rules

The `buildRows()` function processes products in three distinct cases:

**CASE 1: `product.source === "base_root_image"`**

- Each image in `product.root_images` becomes a separate product variation set
- Title extraction:
  - Calls `extractTitleFromImage(img, product.name)`
  - If filename is numeric (`/^\d+$/`) or pX pattern → uses `product.name` (image stem)
  - If filename is in blacklist (`front`, `back`, `mockup`, `preview`, `thumbnail`) → uses `product.name`
  - Otherwise → uses filename stem (without extension)
- Style: Always empty string `""`
- Rows generated: `colors.length × sizes.length` per image
- Price calculation: `base_price + (size_index × step_price)`
- Image mapping:
  - `parent_only` mode: Only first row gets image
  - `per_variation` mode: Every row gets the same image
- Description: `product.description_text` (shared across all rows for this image)

**CASE 2: `product.source === "product_folder" && !product.has_styles`**

- Title: **ALWAYS** `product.name` (folder name). NO image name inference.
- Style: Always empty string `""`
- Color-Image Mapping Logic:
  - **Single Color Mode** (`config.colors.length === 1`):
    - First image from `root_images` → maps to the single color
    - Remaining `root_images` → go to `extraImagePaths`
  - **Multiple Color Mode** (`config.colors.length > 1`):
    - Numbered images (`/^\d+$/`): Map by index (`1.jpg` → `colors[0]`, `2.jpg` → `colors[1]`, etc.)
    - Other images: Go to `extraImagePaths`
  - All `extra_images` (pX pattern) → go to `extraImagePaths`
- Main rows: `colors.length × sizes.length`
  - Each color gets its mapped image (or empty if no mapping)
  - Image mode applies (`parent_only` vs `per_variation`)
- Extra rows: One row per image in `extraImagePaths`
  - Title: `product.name`
  - Style: `""`
  - Color, Size, Price: Empty strings
  - Image: The extra image path/URL
  - Description: `product.description_text`
- Description: `product.description_text` (from product folder)

**CASE 3: `product.has_styles === true`**

- Iterates over each style in `product.styles`
- Title: **ALWAYS** `product.name` (folder name). NO image name inference.
- Style: `style.name` (style folder name)
- Color-Image Mapping Logic (same as CASE 2, but for `style.root_images`):
  - Single Color Mode: First image → color, others → extra
  - Multiple Color Mode: Numbered images map to color index, others → extra
- Main rows per style: `colors.length × sizes.length`
- Extra rows per style: One row per extra image (with style name)
- Description: `style.description_text` (from style folder)

### Title Extraction Rules (`extractTitleFromImage`)

**Only used in CASE 1 (base_root_image):**

1. Extract filename stem (without extension)
2. If stem matches `/^\d+$/` (numeric only) → return `productTitle` (fallback)
3. If stem (lowercased) matches `/^p\d+$/` (pX pattern) → return `productTitle` (fallback)
4. If stem (lowercased) is in blacklist → return `productTitle` (fallback)
5. Otherwise → return filename stem

**Blacklist:** `front`, `back`, `mockup`, `preview`, `thumbnail` (case-insensitive)

**CASE 2 and CASE 3: Title is ALWAYS the product folder name. Image filenames are NEVER used as titles.**

### Image Mapping Rules

**Color-Image Mapping:**
- In single color mode: First image is the main image for that color
- In multiple color mode: Numbered images (`1.jpg`, `2.jpg`, etc.) map to color index (`colors[0]`, `colors[1]`, etc.)
- Index calculation: `image_number - 1` (1.jpg → index 0, 2.jpg → index 1)
- Out-of-bounds indices are ignored (no mapping created)
- Non-numbered images in multiple color mode go to extra rows

**Image Mode (`image_mode`):**
- `parent_only`: Only the first row in each color gets the image (for that color's first size)
- `per_variation`: Every row gets the image for its color

**Image Resolver:**
- `resolveImage(imageFile: ImageFile): string`
- Default resolver returns `imageFile.path`
- When Cloudinary uploads are present, resolver checks `imageUrlByPath.get(imageFile.path)`
- If URL exists in map → returns Cloudinary secure URL
- Otherwise → returns local path

### Rules Preventing Title/Image Mismatch

1. **CASE 2 and CASE 3**: Title is ALWAYS product folder name, never derived from images
2. **CASE 1**: Title extraction from image filename only occurs for non-numeric, non-pX, non-blacklist filenames
3. **Color-Image Mapping**: Images are mapped to colors by index (numbered images) or position (single color), not by filename semantics
4. **Extra Rows**: Extra images appear as separate rows with empty color/size/price, so they don't interfere with main product rows

## 9. Cloudinary Upload Logic (IF PRESENT)

### When Uploads Happen

Uploads occur when:
1. User enables "Upload images to Cloudinary" checkbox
2. User provides Cloud Name and Upload Preset
3. User clicks "Upload Images" button
4. Products have been scanned (`products.length > 0`)

Uploads happen BEFORE generation (Step 3.5), but the image resolver uses uploaded URLs during generation if available.

### Unsigned Upload Configuration

- Uses Cloudinary's unsigned upload endpoint
- Requires `upload_preset` parameter (must be configured in Cloudinary dashboard as unsigned)
- No authentication credentials required in frontend
- Upload URL: `https://api.cloudinary.com/v1_1/{cloudName}/image/upload`

### Public ID Generation Strategy

**Format:** `{folderPrefix}/{jobId}/{sanitizedPath}`

**Example:** `csvgen/1700000000/ProductA/Style1/1`

**Components:**
- `folderPrefix`: User-configurable (default: "csvgen")
- `jobId`: Timestamp in milliseconds (`Date.now().toString()`), unique per upload session
- `sanitizedPath`: Original path with:
  - Extension removed
  - Spaces replaced with underscores
  - Dangerous characters removed (keeps alphanumeric, underscore, slash, hyphen)
  - Leading/trailing slashes removed

**De-duplication Strategy:**
- Public IDs are unique per upload session (jobId prevents collisions)
- Multiple uploads of the same folder will create duplicate images in Cloudinary (different jobId)
- Within a single upload session, `collectImages()` de-duplicates by path before uploading
- If the same image path appears multiple times in products, only one upload occurs

### Error Handling and Retry Behavior

**File Validation:**
- Valid types: `image/jpeg`, `image/jpg`, `image/png`, `image/webp`
- Max size: 25MB
- Validation errors throw immediately (no retry)

**Upload Errors:**
- **4xx errors (400-499)**: Client errors, no retry (invalid preset, authentication, etc.)
- **5xx errors (500-599)**: Server errors, retry up to 2 times
- **Network errors** (TypeError, fetch failures): Retry up to 2 times

**Retry Logic:**
- Exponential backoff: Delay = `2^retryCount × 1000ms` (1s, 2s)
- Maximum 2 retries (3 total attempts)
- Each image upload is independent (failed images don't block others)

### Progress Tracking

**Upload Progress Callback:**
```typescript
{
  total: number,        // Total images to upload
  uploaded: number,     // Successfully uploaded
  failed: number,       // Failed uploads (count)
  current?: string      // Current filename being uploaded
}
```

Progress is updated:
- Before each upload attempt
- After each successful upload
- After each failed upload

### URL Mapping Back to Local Images

**Storage:**
- Uploaded URLs are stored in `Map<string, string>`: `imageUrlByPath`
- Key: `imageFile.path` (original local path, e.g., `"ProductA/1.jpg"`)
- Value: Cloudinary `secure_url` (e.g., `"https://res.cloudinary.com/..."`)

**Usage in Generation:**
- `buildRows()` receives an `ImageResolver` function
- Resolver checks `imageUrlByPath.get(imageFile.path)`
- If URL exists → returns Cloudinary URL
- Otherwise → returns `imageFile.path` (local path)

**Collection:**
- `collectImages(products)` extracts all unique images from products
- De-duplicates by path (same path appears only once)
- Returns `ImageFile[]` for uploading
- After upload, `uploadImages()` returns the map for storage in state

## 10. CSV Writing Logic

### CSV Column Definitions

**Header Row:**
```
Title, Style, Color, Size, Price, Image, Description
```

**Column Order (fixed):**
1. Title
2. Style
3. Color
4. Size
5. Price
6. Image
7. Description

### Encoding

**UTF-8 BOM:**
- CSV string starts with `\uFEFF` (UTF-8 Byte Order Mark)
- Ensures Excel and other spreadsheet software recognize UTF-8 encoding
- Prevents character encoding issues with non-ASCII characters

### Row Serialization

**Field Escaping:**
- Fields containing `,`, `"`, or `\n` are wrapped in double quotes
- Double quotes within fields are escaped as `""`
- Fields without special characters are not quoted

**Line Endings:**
- Rows are joined with `\n` (Unix-style line endings)
- No trailing newline after last row

**Serialization Process:**
1. Add BOM + header row (escaped fields, comma-separated)
2. For each `CsvRow`:
   - Extract values: `[title, style, color, size, price, image, description]`
   - Escape each field
   - Join with commas
   - Append to CSV string
3. Return complete CSV string

### Download Behavior in Browser

**`downloadCsv(rows, filename)` function:**

1. Calls `rowsToCsv(rows)` to generate CSV string
2. Creates `Blob` with type `"text/csv;charset=utf-8;"`
3. Creates object URL: `URL.createObjectURL(blob)`
4. Creates temporary `<a>` element with:
   - `href`: object URL
   - `download`: filename (default: `"csv_generator_output.csv"`)
5. Appends link to document body
6. Programmatically clicks link (triggers download)
7. Removes link from DOM
8. Revokes object URL (cleanup)

**Browser Behavior:**
- Download is handled by browser's download manager
- File is saved to user's default download location
- Filename can be changed by user during save dialog (browser-dependent)

## 11. Error Handling & Edge Cases

### Common Failure Modes Handled in Code

**File Selection:**
- Empty file selection: Early return, no error shown
- File System Access API not supported: Alert message, suggests file input
- AbortError (user cancels folder picker): Silently ignored

**Scanning:**
- Missing description files: `undefined` stored, no error
- Invalid image files: Filtered out (only `.jpg`, `.jpeg`, `.png`, `.webp` processed)
- Empty folders: Ignored (no products created)
- Scan errors: Caught in `handleScan()`, alert shown, error logged to console

**Generation:**
- Empty products array: Alert "Please scan a folder first"
- Empty colors/sizes: Alert "Please provide at least one color and one size"
- Invalid price numbers: Alert "Please provide valid price numbers"
- No images in products: Generation proceeds (empty image fields in rows)

**Cloudinary Upload:**
- Missing Cloud Name/Preset: Alert before upload starts
- No images to upload: Alert, upload cancelled
- Upload failures: Collected in `failedPaths[]`, displayed in UI, alert shows failure count
- Network errors: Retried automatically (up to 2 retries)
- 4xx errors: No retry, error logged

**CSV Download:**
- Empty rows array: Download button hidden (only shown if `rows.length > 0`)
- Browser download restrictions: Handled by browser (may show save dialog or block)

### How Errors Are Surfaced to Users

**Alerts:**
- File selection errors
- Scan errors
- Generation validation errors
- Upload configuration errors
- Upload completion (success/failure count)

**UI Indicators:**
- Upload progress: Progress bar, uploaded/total/failed counts, current filename
- Upload errors: Red error panel with list of failed paths
- Upload success: Green success message with count
- Scan summary: Product/style/image counts (only shown if scan succeeds)

**Console Logging:**
- All errors are logged to console: `console.error()`
- Debug mode: Detailed logs (product counts, sample paths, row mappings)
- Upload failures: Individual errors logged per image

### What Is NOT Handled

**Not Handled:**
- ZIP file extraction (only folders are supported)
- Very large folder structures (no pagination or streaming)
- Corrupted image files (may fail during Cloudinary upload, but not validated before)
- Concurrent scans (state can be overwritten if user selects new folder during scan)
- Concurrent generations (state can be overwritten)
- Browser storage limits (localStorage for store ID only, no large data storage)
- Network connectivity during uploads (retries handle temporary failures, but permanent failures are not recovered)
- CSV file size limits (browser-dependent, not enforced)
- Duplicate product names (all products are processed, duplicates possible in CSV)
- Invalid folder structures (e.g., nested styles, empty product folders) - processed as-is, may produce unexpected rows

## 12. Debug & Verification Aids

### Debug Mode Toggle

**Location:** Step 4 (Generate Rows) card, checkbox labeled "Debug Mode"

**When Enabled:**
- Logs detailed information to browser console after generation
- Output includes:
  - Total products count
  - Total rows generated
  - Total unique images (by path)
  - Sample image paths (first 20)
  - Sample `imageUrlByPath` keys (first 10) with URLs
  - Sample CSV row image mappings (first 10)

**Console Output Format:**
```
=== DEBUG MODE ===
Total products: X
Total rows generated: Y
Total unique images (by path): Z
Sample image paths (first 20):
  1. ProductA/1.jpg
  2. ProductA/2.jpg
  ...
Sample imageUrlByPath keys (first 10):
  1. ProductA/1.jpg -> https://res.cloudinary.com/.../...
  ...
Sample CSV row image mappings (first 10):
  1. Image: https://res.cloudinary.com/.../...
  ...
=== END DEBUG ===
```

### Self-Check Function

**`selfCheck(products, rows)` function:**

Returns validation statistics:
```typescript
{
  case1Count: number,  // base_root_image products
  case2Count: number,  // product_folder without styles
  case3Count: number,  // product_folder with styles
  totalRows: number    // Total CSV rows generated
}
```

**Usage:**
- Called automatically after `buildRows()` in `handleGenerate()`
- Result logged to console: `console.log("Self-check:", check)`
- Useful for verifying product classification matches row generation

### Manual Verification Steps

1. **Verify Scan Results:**
   - Check scan summary (products/styles/images counts)
   - Inspect `products` array in React DevTools
   - Verify image classification (numbered/extra/other)

2. **Verify Generation:**
   - Enable debug mode
   - Check console for self-check results
   - Verify row counts match expected: `(colors × sizes × products) + extra_rows`

3. **Verify Cloudinary Uploads:**
   - Check upload progress (uploaded/total/failed)
   - Inspect `imageUrlByPath` Map in React DevTools
   - Verify URLs are accessible (open in browser)

4. **Verify CSV Output:**
   - Download CSV and open in Excel/text editor
   - Check UTF-8 encoding (BOM should prevent issues)
   - Verify column order and escaping
   - Count rows (should match generated count)
   - Verify image URLs/paths are correct

5. **Verify Image Mapping:**
   - Check CASE 2/3 products: Title should be folder name
   - Check CASE 1 products: Title may be image filename (if not numeric/pX/blacklist)
   - Verify color-image mappings (numbered images map to color index)
   - Verify extra rows have empty color/size/price

## 13. Extension Points

### Where New Features Could Be Added Safely

**1. Additional Image Classification Rules**
- **Location:** `src/csvgen/scan.ts`, `classifyImage()` function
- **Change:** Add new patterns to detect additional image types
- **Impact:** Low (only affects classification, not core logic)

**2. Additional CSV Columns**
- **Location:** `src/csvgen/types.ts` (add fields to `CsvRow`), `src/csvgen/csv.ts` (update header), `src/csvgen/generate.ts` (populate new fields)
- **Change:** Extend `CsvRow` interface, update CSV header, populate fields in `buildRows()`
- **Impact:** Medium (requires changes in multiple files, but structure supports it)

**3. Custom Sorting Rules**
- **Location:** `src/csvgen/sort.ts`
- **Change:** Modify sort functions to use different criteria
- **Impact:** Low (sorting is isolated, deterministic)

**4. Additional Upload Providers**
- **Location:** Create new module (e.g., `src/csvgen/s3.ts`), update `CsvGeneratorPage` to support multiple providers
- **Change:** Implement similar interface to `cloudinary.ts`, add UI for provider selection
- **Impact:** Medium (requires UI changes, but image resolver pattern supports it)

**5. ZIP File Support**
- **Location:** `src/components/CsvGeneratorPage.tsx`, add ZIP extraction library (e.g., JSZip)
- **Change:** Add ZIP file input handler, extract files to `LocalFile[]`, then use existing scan logic
- **Impact:** Medium (adds dependency, but reuses existing scan/generate logic)

**6. Batch Processing for Large Folders**
- **Location:** `src/csvgen/scan.ts`, `src/csvgen/generate.ts`
- **Change:** Add pagination/streaming for very large folder structures
- **Impact:** High (requires significant refactoring of scan and generate logic)

**7. Export to Other Formats (JSON, Excel)**
- **Location:** Create new modules (e.g., `src/csvgen/json.ts`, `src/csvgen/excel.ts`)
- **Change:** Implement format-specific serialization functions
- **Impact:** Low (can reuse `CsvRow[]` structure, only serialization changes)

**8. Preview/Edit Rows Before Download**
- **Location:** `src/components/CsvGeneratorPage.tsx`
- **Change:** Add table component to display/edit `rows` before download
- **Impact:** Medium (requires UI component, but state structure supports it)

### What Must NOT Be Changed to Avoid Breaking Core Flow

**1. CASE Branching Logic in `buildRows()`**
- **Why:** Core business logic, changes would produce incorrect CSV output
- **Files:** `src/csvgen/generate.ts`
- **Rule:** CASE 1/2/3 conditions and row generation logic must remain as-is

**2. Image Classification Patterns**
- **Why:** Classification determines image grouping and mapping rules
- **Files:** `src/csvgen/scan.ts`, `classifyImage()` function
- **Rule:** Numbered (`/^\d+$/`), extra (`/^p\d+$/i`), other patterns must remain consistent

**3. Path Preservation in Scanning**
- **Why:** Paths are used for de-duplication, Cloudinary mapping, and image resolution
- **Files:** `src/csvgen/scan.ts`, `getFilesInFolder()` function
- **Rule:** `LocalFile.path` must preserve original relative paths, never truncate or modify

**4. Title Extraction Rules for CASE 2/3**
- **Why:** Title must always be product folder name (prevents mismatches)
- **Files:** `src/csvgen/generate.ts`, CASE 2 and CASE 3 in `buildRows()`
- **Rule:** `finalTitle = product.name` must never use image filename inference

**5. CSV Column Order**
- **Why:** Fixed schema expected by downstream systems
- **Files:** `src/csvgen/csv.ts`, `rowsToCsv()` function
- **Rule:** Header order must remain: Title, Style, Color, Size, Price, Image, Description

**6. Image Resolver Interface**
- **Why:** Used by `buildRows()` to resolve images to URLs/paths
- **Files:** `src/csvgen/generate.ts`, `ImageResolver` type
- **Rule:** Resolver signature `(imageFile: ImageFile) => string` must not change

**7. Product Source Types**
- **Why:** Used in CASE branching logic
- **Files:** `src/csvgen/types.ts`, `ProductSource` type
- **Rule:** `"base_root_image" | "product_folder"` values must remain as-is

**8. Sorting Determinism**
- **Why:** Ensures consistent CSV output across runs
- **Files:** `src/csvgen/sort.ts`
- **Rule:** Sort functions must remain deterministic (no random ordering)

