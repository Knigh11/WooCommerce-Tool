// Description Builder API Client

import {
    GenerateRequest,
    GenerateResponse,
    PreviewRequest,
    PreviewResponse,
    UploadResponse,
} from "../utils/descriptionBuilderSchemas"
import { apiFetch } from "./client"

const API_BASE = import.meta.env.VITE_API_BASE || ""
const USE_PROXY = !API_BASE || import.meta.env.DEV

function getBaseUrl() {
  return USE_PROXY ? "" : API_BASE
}

export async function uploadZip(
  storeId: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append("file", file)

  const url = `${getBaseUrl()}/api/v2/stores/${storeId}/desc-builder/upload-zip`

  // Get store API key
  const { getStoreApiKey } = await import("../utils/storeKey")
  const storeKey = getStoreApiKey(storeId)
  if (!storeKey) {
    // Only throw error when user actually tries to upload
    throw new Error("Store API key not found. Please configure it in store settings.")
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = (e.loaded / e.total) * 100
        onProgress(percent)
      }
    })

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText)
          resolve(data)
        } catch (err) {
          reject(new Error("Invalid JSON response"))
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText)
          const errorCode = error.code || error.error_code
          if (errorCode === "missing_store_key" || errorCode === "invalid_store_key") {
            reject(new Error("Store API key is missing or invalid. Please configure it in store settings."))
          } else {
            reject(new Error(error.detail || `HTTP ${xhr.status}`))
          }
        } catch {
          reject(new Error(`HTTP ${xhr.status}`))
        }
      }
    })

    xhr.addEventListener("error", () => {
      reject(new Error("Network error"))
    })

    xhr.open("POST", url)
    if (storeKey) {
      xhr.setRequestHeader("X-Store-Key", storeKey)
    }
    xhr.send(formData)
  })
}

export async function preview(
  storeId: string,
  payload: PreviewRequest
): Promise<PreviewResponse> {
  const { data } = await apiFetch<PreviewResponse>(
    `/api/v2/stores/${storeId}/desc-builder/preview`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      storeId,
    }
  )
  return data
}

export async function generate(
  storeId: string,
  payload: GenerateRequest
): Promise<GenerateResponse> {
  const { data } = await apiFetch<GenerateResponse>(
    `/api/v2/stores/${storeId}/desc-builder/generate`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      storeId,
    }
  )
  return data
}

export function jobEventsUrl(storeId: string, jobId: string, token: string): string {
  return `${getBaseUrl()}/api/v1/stores/${storeId}/jobs/${jobId}/events?token=${encodeURIComponent(token)}`
}

export function downloadUrl(storeId: string, jobId: string, token: string): string {
  return `${getBaseUrl()}/api/v2/stores/${storeId}/desc-builder/download/${jobId}?token=${encodeURIComponent(token)}`
}

export interface PresetInfo {
  category_key: string
  display_name: string
  product_type: string
  fit: string
  use: string
  seo_keywords: string[]
}

export interface PresetListResponse {
  presets: PresetInfo[]
  default_template: string
}

export async function listPresets(storeId: string): Promise<PresetListResponse> {
  const { data } = await apiFetch<PresetListResponse>(
    `/api/v2/stores/${storeId}/desc-builder/presets`,
    { method: "GET", storeId }
  )
  return data
}

export async function getPreset(storeId: string, categoryKey: string): Promise<PresetInfo> {
  const { data } = await apiFetch<PresetInfo>(
    `/api/v2/stores/${storeId}/desc-builder/presets/${categoryKey}`,
    { method: "GET", storeId }
  )
  return data
}

