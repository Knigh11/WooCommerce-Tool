// V2 Upsell Combos API Client

import { apiFetch } from "../client"
import { UpsellComboOut, UpsellComboCreate, UpsellComboUpdate } from "./types"

export interface UpsellComboListResponse {
  items: UpsellComboOut[]
  total: number
  page: number
  page_size: number
}

export async function listCombos(
  storeId: string,
  params?: { page?: number; page_size?: number; search?: string }
): Promise<UpsellComboListResponse> {
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set("page", params.page.toString())
  if (params?.page_size) searchParams.set("page_size", params.page_size.toString())
  if (params?.search) searchParams.set("search", params.search)
  
  const query = searchParams.toString()
  const url = `/api/v2/stores/${storeId}/upsell-combos${query ? `?${query}` : ""}`
  
  const { data } = await apiFetch<UpsellComboListResponse>(url)
  return data
}

export async function getCombo(
  storeId: string,
  comboId: number
): Promise<UpsellComboOut> {
  const { data } = await apiFetch<UpsellComboOut>(
    `/api/v2/stores/${storeId}/upsell-combos/${comboId}`
  )
  return data
}

export async function createCombo(
  storeId: string,
  request: UpsellComboCreate
): Promise<UpsellComboOut> {
  const { data } = await apiFetch<UpsellComboOut>(
    `/api/v2/stores/${storeId}/upsell-combos`,
    {
      method: "POST",
      body: JSON.stringify(request),
    }
  )
  return data
}

export async function updateCombo(
  storeId: string,
  comboId: number,
  request: UpsellComboUpdate
): Promise<UpsellComboOut> {
  const { data } = await apiFetch<UpsellComboOut>(
    `/api/v2/stores/${storeId}/upsell-combos/${comboId}`,
    {
      method: "PATCH",
      body: JSON.stringify(request),
    }
  )
  return data
}

export async function deleteCombo(
  storeId: string,
  comboId: number
): Promise<{ ok: boolean }> {
  const { data } = await apiFetch<{ ok: boolean }>(
    `/api/v2/stores/${storeId}/upsell-combos/${comboId}`,
    {
      method: "DELETE",
    }
  )
  return data
}

