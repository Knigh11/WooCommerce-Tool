import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "../api/client"
import { endpoints } from "../api/endpoints"
import { JobResponse } from "../api/types"

export function useJobStatus(storeId: string | null, jobId: string | null) {
  return useQuery({
    queryKey: ["job", storeId, jobId],
    queryFn: async () => {
      if (!storeId || !jobId) return null
      const { data } = await apiFetch<JobResponse>(
        endpoints.job(storeId, jobId)
      )
      return data
    },
    enabled: !!storeId && !!jobId,
    refetchInterval: (query) => {
      const job = query.state.data
      if (!job) return false
      // Poll every 3 seconds if job is not in terminal state
      // Polling chậm hơn vì SSE sẽ handle real-time updates
      if (["done", "failed", "cancelled"].includes(job.status)) {
        return false
      }
      return 3000 // 3 giây thay vì 2 giây để giảm tải
    },
  })
}

