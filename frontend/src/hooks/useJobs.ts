import { useMutation } from "@tanstack/react-query"
import { apiFetch } from "../api/client"
import { endpoints } from "../api/endpoints"
import { JobCreateResponse } from "../api/types"
import {
  PriceUpdateRequest,
  DeleteProductsRequest,
} from "../api/types"

export function useCreatePriceUpdateJob() {
  return useMutation({
    mutationFn: async ({
      storeId,
      request,
    }: {
      storeId: string
      request: PriceUpdateRequest
    }) => {
      const { data } = await apiFetch<JobCreateResponse>(
        endpoints.updatePricesJob(storeId),
        {
          method: "POST",
          body: JSON.stringify(request),
        }
      )
      return data
    },
  })
}

export function useCreateDeleteProductsJob() {
  return useMutation({
    mutationFn: async ({
      storeId,
      request,
    }: {
      storeId: string
      request: DeleteProductsRequest
    }) => {
      const { data } = await apiFetch<JobCreateResponse>(
        endpoints.deleteProductsJob(storeId),
        {
          method: "POST",
          body: JSON.stringify(request),
        }
      )
      return data
    },
  })
}

export function useCreateBulkUpdateJob() {
  return useMutation({
    mutationFn: async ({
      storeId,
      request,
    }: {
      storeId: string
      request: any // BulkUpdateRequest - keeping existing API shape
    }) => {
      const { data } = await apiFetch<JobCreateResponse>(
        endpoints.bulkUpdateJob(storeId),
        {
          method: "POST",
          body: JSON.stringify(request),
        }
      )
      return data
    },
  })
}

export function useCreateCsvImportJob() {
  return useMutation({
    mutationFn: async ({
      storeId,
      formData,
    }: {
      storeId: string
      formData: FormData
    }) => {
      const { data } = await apiFetch<JobCreateResponse>(
        endpoints.csvImportJob(storeId),
        {
          method: "POST",
          body: formData,
        }
      )
      return data
    },
  })
}

