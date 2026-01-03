import { useEffect, useRef } from "react"
import { useJobManager } from "../state/jobManager"
import { endpoints } from "../api/endpoints"
import {
  SSELogEvent,
  SSEProgressEvent,
  SSEStatusEvent,
} from "../api/types"

interface UseJobEventsSSEOptions {
  storeId: string | null
  jobId: string | null
  enabled?: boolean
}

export function useJobEventsSSE({
  storeId,
  jobId,
  enabled = true,
}: UseJobEventsSSEOptions) {
  const { updateJob, getJob } = useJobManager()
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 3

  useEffect(() => {
    if (!enabled || !storeId || !jobId) {
      // Đóng connection nếu disabled
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      return
    }

    // Kiểm tra xem đã có connection chưa - tránh tạo nhiều connections
    if (eventSourceRef.current && eventSourceRef.current.readyState !== EventSource.CLOSED) {
      // Connection đã tồn tại và đang hoạt động, không tạo mới
      return
    }

    // Kiểm tra job đã xong chưa - vẫn kết nối SSE để lấy logs cuối cùng
    // Chỉ đóng khi job đã xong và đã có logs đầy đủ
    const job = getJob(jobId)
    if (job && ["done", "failed", "cancelled"].includes(job.status)) {
      // Nếu job đã xong và đã có logs, không cần kết nối nữa
      // Nhưng nếu chưa có logs hoặc logs chưa đầy đủ, vẫn kết nối để lấy logs cuối
      if (job.logs && job.logs.length > 0) {
        if (eventSourceRef.current) {
          eventSourceRef.current.close()
          eventSourceRef.current = null
        }
        return
      }
    }

    let reconnectTimeout: number | null = null
    // Get job token from job manager if available (reuse job variable from above)
    const jobToken = job?.jobToken
    const sseUrl = endpoints.jobEvents(storeId, jobId, jobToken)

    const connectSSE = () => {
      // Đóng connection cũ nếu có
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }

      const eventSource = new EventSource(sseUrl)
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        reconnectAttemptsRef.current = 0
        updateJob(jobId, { sseConnected: true })
      }

      eventSource.onerror = (err) => {
        console.error("SSE error:", err)
        
        if (eventSource.readyState === EventSource.CLOSED) {
          updateJob(jobId, { sseConnected: false })
          
          // Kiểm tra job đã xong chưa - không reconnect nếu đã xong
          const currentJob = getJob(jobId)
          if (currentJob && ["done", "failed", "cancelled"].includes(currentJob.status)) {
            return
          }
          
          // Try to reconnect if we haven't exceeded max attempts
          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current++
            reconnectTimeout = window.setTimeout(() => {
              connectSSE()
            }, 2000 * reconnectAttemptsRef.current) // Exponential backoff
          } else {
            // Fall back to polling - the useJobStatus hook will handle it
            console.warn("SSE failed repeatedly, falling back to polling")
          }
        }
      }

      eventSource.addEventListener("connected", () => {
        updateJob(jobId, { sseConnected: true })
      })

      eventSource.addEventListener("status", (e) => {
        try {
          const data: SSEStatusEvent = JSON.parse(e.data)
          updateJob(jobId, {
            status: data.status as any,
            progress: data.total
              ? { done: 0, total: data.total, percent: 0 }
              : undefined,
          })
          
          // Đóng SSE nếu job đã xong và đã có logs đầy đủ
          // Nhưng vẫn giữ connection một chút để đảm bảo nhận được tất cả logs cuối cùng
          if (["done", "failed", "cancelled"].includes(data.status)) {
            // Đợi 2 giây để đảm bảo nhận được tất cả logs cuối cùng
            setTimeout(() => {
              const currentJob = getJob(jobId)
              if (currentJob && ["done", "failed", "cancelled"].includes(currentJob.status)) {
                if (eventSourceRef.current) {
                  eventSourceRef.current.close()
                  eventSourceRef.current = null
                }
              }
            }, 2000)
          }
        } catch (err) {
          console.error("Error parsing status event:", err)
        }
      })

      eventSource.addEventListener("progress", (e) => {
        try {
          const data: SSEProgressEvent = JSON.parse(e.data)
          updateJob(jobId, {
            progress: {
              done: data.done,
              total: data.total,
              percent: data.percent,
            },
            metrics: {
              success: data.success,
              failed: data.failed,
              retried: data.retried,
              skipped: data.skipped,
            },
            current: data.current,
          })
        } catch (err) {
          console.error("Error parsing progress event:", err)
        }
      })

      eventSource.addEventListener("log", (e) => {
        try {
          const data: SSELogEvent = JSON.parse(e.data)
          const currentJob = getJob(jobId)
          if (currentJob) {
            // Đảm bảo logs được append real-time, không bị mất
            const existingLogs = currentJob.logs || []
            // Tránh duplicate logs (check by timestamp và message)
            const isDuplicate = existingLogs.some(
              (log) => log.ts === data.ts && log.msg === data.msg
            )
            if (!isDuplicate) {
              updateJob(jobId, {
                logs: [...existingLogs, data],
              })
            }
          }
        } catch (err) {
          console.error("Error parsing log event:", err)
        }
      })
    }

    connectSSE()

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [storeId, jobId, enabled]) // Loại bỏ updateJob và getJob khỏi dependency array

  // Close SSE when job reaches terminal state
  useEffect(() => {
    if (!jobId || !enabled) return
    const job = getJob(jobId)
    if (job && ["done", "failed", "cancelled"].includes(job.status)) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [jobId, enabled]) // Loại bỏ getJob khỏi dependency array, chỉ check khi jobId hoặc enabled thay đổi
}

