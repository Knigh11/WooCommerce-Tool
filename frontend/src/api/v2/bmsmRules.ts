// V2 BMSM Rules API Client

import { apiFetch } from "../client"
import { BmsmRuleOut, BmsmRuleCreate, BmsmRuleUpdate } from "./types"

export interface BmsmRuleListResponse {
  items: BmsmRuleOut[]
  total: number
  page: number
  page_size: number
}

export async function listRules(
  storeId: string,
  params?: { page?: number; page_size?: number; search?: string; filter?: string }
): Promise<BmsmRuleListResponse> {
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set("page", params.page.toString())
  if (params?.page_size) searchParams.set("page_size", params.page_size.toString())
  if (params?.search) searchParams.set("search", params.search)
  if (params?.filter) searchParams.set("filter", params.filter)
  
  const query = searchParams.toString()
  const url = `/api/v2/stores/${storeId}/bmsm-rules${query ? `?${query}` : ""}`
  
  const { data } = await apiFetch<BmsmRuleListResponse>(url)
  return data
}

export async function getRule(
  storeId: string,
  ruleId: number
): Promise<BmsmRuleOut> {
  const { data } = await apiFetch<BmsmRuleOut>(
    `/api/v2/stores/${storeId}/bmsm-rules/${ruleId}`
  )
  return data
}

export async function createRule(
  storeId: string,
  request: BmsmRuleCreate
): Promise<BmsmRuleOut> {
  const { data } = await apiFetch<BmsmRuleOut>(
    `/api/v2/stores/${storeId}/bmsm-rules`,
    {
      method: "POST",
      body: JSON.stringify(request),
    }
  )
  return data
}

export async function updateRule(
  storeId: string,
  ruleId: number,
  request: BmsmRuleUpdate
): Promise<BmsmRuleOut> {
  const { data } = await apiFetch<BmsmRuleOut>(
    `/api/v2/stores/${storeId}/bmsm-rules/${ruleId}`,
    {
      method: "PATCH",
      body: JSON.stringify(request),
    }
  )
  return data
}

export async function deleteRule(
  storeId: string,
  ruleId: number
): Promise<{ ok: boolean }> {
  const { data } = await apiFetch<{ ok: boolean }>(
    `/api/v2/stores/${storeId}/bmsm-rules/${ruleId}`,
    {
      method: "DELETE",
    }
  )
  return data
}

