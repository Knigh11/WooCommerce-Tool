import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "../api/client"
import { endpoints } from "../api/endpoints"
import { StoreSummary, StoreDetail } from "../api/types"
import { useStore } from "../state/storeContext"
import { updateStoreApiKeyFromProfile } from "../utils/storeKey"

export function useStores() {
  const { setStores, selectedStoreId } = useStore()

  const query = useQuery({
    queryKey: ["stores"],
    queryFn: async () => {
      const { data } = await apiFetch<StoreSummary[]>(endpoints.stores())
      setStores(data)
      
      // Load API keys for all stores (especially selected one)
      if (selectedStoreId) {
        try {
          const { data: detail } = await apiFetch<StoreDetail>(endpoints.store(selectedStoreId), {
            storeId: selectedStoreId, // This will fail if no key, but that's OK
          })
          updateStoreApiKeyFromProfile(selectedStoreId, detail)
        } catch {
          // Ignore errors - key might not be set yet
        }
      }
      
      return data
    },
    staleTime: 60 * 1000, // 60 seconds
  })

  return query
}

