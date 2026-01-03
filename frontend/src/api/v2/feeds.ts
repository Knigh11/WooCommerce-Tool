// V2 Feeds API Client

import { getClientSession } from "../../utils/clientSession"
import { apiFetch } from "../client"

export interface FeedFilters {
  category_id?: number | null
  after_date?: string | null
  product_limit?: number | null
  product_ids?: number[] | null
}

export interface FeedDefaults {
  google_category?: string | null
  product_type?: string | null
  gender?: string | null
  age_group?: string | null
}

export interface SheetsConfig {
  sheet_id: string
  tab_name?: string
  credentials_json_base64: string
}

export interface FeedExportOptions {
  xml?: boolean
  sheets?: boolean
  local_legacy?: boolean
  sheets_legacy?: boolean
  sheets_config?: SheetsConfig | null
}

export interface FeedJobCreateRequest {
  channel: "gmc" | "bing" | "both"
  filters: FeedFilters
  defaults: FeedDefaults
  export: FeedExportOptions
}

export interface FeedJobResponse {
  job_id: string
  status?: string
  sse_url: string
  download_url: string
  token?: string  // Job token for SSE access
}

export interface FeedJobDetail {
  job_id: string
  store_id: string
  job_type: string
  status: string
  progress?: {
    done: number
    total: number
    percent: number
  } | null
  metrics?: {
    success: number
    failed: number
    retried: number
    skipped: number
  } | null
  created_at?: string
  updated_at?: string
  outputs?: {
    xml_path?: string
    xml_filename?: string
    zip_path?: string
    zip_filename?: string
    xml_files?: Array<{
      channel: string
      path: string
      filename: string
    }>
  }
  items_count?: number
}

/**
 * Create feed generation job
 */
export async function createFeedJob(
  storeId: string,
  payload: FeedJobCreateRequest
): Promise<FeedJobResponse> {
  const { data } = await apiFetch<FeedJobResponse>(
    `/api/v2/stores/${storeId}/feeds/jobs`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      storeId,
    }
  )
  return data
}

/**
 * List feed jobs
 */
export async function listFeedJobs(
  storeId: string,
  params?: { page?: number; per_page?: number }
): Promise<FeedJobDetail[]> {
  let url = `/api/v2/stores/${storeId}/feeds/jobs`
  if (params) {
    const searchParams = new URLSearchParams()
    if (params.page) searchParams.set('page', params.page.toString())
    if (params.per_page) searchParams.set('per_page', params.per_page.toString())
    const query = searchParams.toString()
    if (query) url += `?${query}`
  }
  
  const { data } = await apiFetch<FeedJobDetail[]>(
    url,
    {
      method: "GET",
      storeId,
    }
  )
  return data
}

/**
 * Get feed job detail
 */
export async function getFeedJob(
  storeId: string,
  jobId: string
): Promise<FeedJobDetail> {
  const { data } = await apiFetch<FeedJobDetail>(
    `/api/v2/stores/${storeId}/feeds/jobs/${jobId}`,
    {
      method: "GET",
      storeId,
    }
  )
  return data
}

/**
 * Extract token from SSE URL
 */
export function extractTokenFromSseUrl(sseUrl: string): string | null {
  try {
    const url = new URL(sseUrl, window.location.origin)
    return url.searchParams.get('token')
  } catch {
    // If sseUrl is relative, parse manually
    const match = sseUrl.match(/[?&]token=([^&]+)/)
    return match ? match[1] : null
  }
}

/**
 * Get feed events SSE URL
 */
export function getFeedEventsUrl(
  storeId: string,
  jobId: string,
  token?: string
): string {
  const clientSession = getClientSession()
  const base = `/api/v2/stores/${storeId}/feeds/jobs/${jobId}/events`
  const params = new URLSearchParams()
  if (token) params.set('token', token)
  params.set('client_session', clientSession)
  return `${base}?${params.toString()}`
}

/**
 * Get feed download URL
 */
export function getFeedDownloadUrl(
  storeId: string,
  jobId: string
): string {
  return `/api/v2/stores/${storeId}/feeds/jobs/${jobId}/download`
}

