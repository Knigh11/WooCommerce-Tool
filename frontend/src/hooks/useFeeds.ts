import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  createFeedJob,
  getFeedJob,
  listFeedJobs,
  FeedJobCreateRequest,
  FeedJobDetail,
} from "../api/v2/feeds"

/**
 * Query feed jobs list
 */
export function useFeedJobs(storeId: string | null) {
  return useQuery({
    queryKey: ["feedJobs", storeId],
    queryFn: () => {
      if (!storeId) throw new Error("Store ID required")
      return listFeedJobs(storeId)
    },
    enabled: !!storeId,
    staleTime: 10 * 1000, // 10 seconds
  })
}

/**
 * Query single feed job
 */
export function useFeedJob(storeId: string | null, jobId: string | null) {
  return useQuery({
    queryKey: ["feedJob", storeId, jobId],
    queryFn: () => {
      if (!storeId || !jobId) throw new Error("Store ID and Job ID required")
      return getFeedJob(storeId, jobId)
    },
    enabled: !!storeId && !!jobId,
    staleTime: 5 * 1000, // 5 seconds
    refetchInterval: (query) => {
      const data = query.state.data as FeedJobDetail | undefined
      // Poll if job is still running
      if (data && ["queued", "running"].includes(data.status)) {
        return 3000 // Poll every 3 seconds
      }
      return false // Don't poll if done/failed/cancelled
    },
  })
}

/**
 * Mutation to create feed job
 */
export function useCreateFeedJob(storeId: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: FeedJobCreateRequest) => {
      if (!storeId) throw new Error("Store ID required")
      return createFeedJob(storeId, payload)
    },
    onSuccess: () => {
      // Invalidate jobs list
      if (storeId) {
        queryClient.invalidateQueries({ queryKey: ["feedJobs", storeId] })
      }
    },
  })
}

