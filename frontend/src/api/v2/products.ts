// V2 Products API Client

import { apiFetch } from "../client"
import { ProductCard } from "./types"

export interface ProductCardListResponse {
  items: ProductCard[]
}

export interface ProductCardsRequest {
  ids: number[]
}

export async function searchProducts(
  storeId: string,
  query: string,
  limit: number = 20
): Promise<ProductCardListResponse> {
  const { data } = await apiFetch<ProductCardListResponse>(
    `/api/v2/stores/${storeId}/products/search?q=${encodeURIComponent(query)}&limit=${limit}`
  )
  return data
}

export async function getProductCards(
  storeId: string,
  ids: number[]
): Promise<ProductCardListResponse> {
  const { data } = await apiFetch<ProductCardListResponse>(
    `/api/v2/stores/${storeId}/products/cards`,
    {
      method: "POST",
      body: JSON.stringify({ ids }),
    }
  )
  return data
}

