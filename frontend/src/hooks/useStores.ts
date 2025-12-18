import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "../api/client"
import { endpoints } from "../api/endpoints"
import { StoreSummary } from "../api/types"
import { useStore } from "../state/storeContext"

export function useStores() {
  const { setStores } = useStore()

  const query = useQuery({
    queryKey: ["stores"],
    queryFn: async () => {
      const { data } = await apiFetch<StoreSummary[]>(endpoints.stores())
      setStores(data)
      return data
    },
    staleTime: 60 * 1000, // 60 seconds
  })

  return query
}

