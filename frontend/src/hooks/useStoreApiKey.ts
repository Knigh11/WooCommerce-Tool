/**
 * Hook to automatically load and cache store API key when store is selected.
 */
import { useQuery } from "@tanstack/react-query"
import { useEffect } from "react"
import { apiFetch } from "../api/client"
import { endpoints } from "../api/endpoints"
import { StoreDetail } from "../api/types"
import { useStore } from "../state/storeContext"
import { updateStoreApiKeyFromProfile } from "../utils/storeKey"

export function useStoreApiKey() {
  const { selectedStoreId } = useStore()

  const { data: storeDetail } = useQuery({
    queryKey: ["storeDetail", selectedStoreId],
    queryFn: async () => {
      if (!selectedStoreId) return null
      
      try {
        // Try to load store detail without X-Store-Key first (for stores endpoint)
        // If it fails, that's OK - the key might not be set yet
        const { data } = await apiFetch<StoreDetail>(
          endpoints.store(selectedStoreId),
          { storeId: selectedStoreId } // Will include X-Store-Key if available
        )
        
        // Update API key cache if available
        if (data?.api_key) {
          updateStoreApiKeyFromProfile(selectedStoreId, data)
        }
        
        return data
      } catch (error) {
        // If store endpoint requires X-Store-Key and we don't have it,
        // try loading without it (might work for some endpoints)
        console.warn(`Failed to load store detail for ${selectedStoreId}:`, error)
        return null
      }
    },
    enabled: !!selectedStoreId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1, // Only retry once
  })

  // Update cache whenever store detail is loaded
  useEffect(() => {
    if (storeDetail?.api_key && selectedStoreId) {
      updateStoreApiKeyFromProfile(selectedStoreId, storeDetail)
    }
  }, [storeDetail, selectedStoreId])

  return storeDetail
}

