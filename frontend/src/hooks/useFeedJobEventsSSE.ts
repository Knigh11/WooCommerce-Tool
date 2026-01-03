import { useEffect, useRef, useState } from "react"
import { getFeedEventsUrl } from "../api/v2/feeds"
import { SSELogEvent, SSEProgressEvent, SSEStatusEvent } from "../api/types"

interface UseFeedJobEventsSSEOptions {
  storeId: string | null
  jobId: string | null
  token?: string
  enabled?: boolean
}

export function useFeedJobEventsSSE({
  storeId,
  jobId,
  token,
  enabled = true,
}: UseFeedJobEventsSSEOptions) {
  const [status, setStatus] = useState<string | null>(null)
  const [progress, setProgress] = useState<{
    done: number
    total: number
    percent: number
  } | null>(null)
  const [logs, setLogs] = useState<SSELogEvent[]>([])
  const [connected, setConnected] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 3

  useEffect(() => {
    if (!enabled || !storeId || !jobId) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      return
    }

    if (
      eventSourceRef.current &&
      eventSourceRef.current.readyState !== EventSource.CLOSED
    ) {
      return
    }

    // Check if job is done
    if (status && ["done", "failed", "cancelled"].includes(status)) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      return
    }

    let reconnectTimeout: number | null = null
    const sseUrl = getFeedEventsUrl(storeId, jobId, token)

    const connectSSE = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }

      const eventSource = new EventSource(sseUrl)
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        reconnectAttemptsRef.current = 0
        setConnected(true)
      }

      eventSource.onerror = (err) => {
        console.error("Feed SSE error:", err)

        if (eventSource.readyState === EventSource.CLOSED) {
          setConnected(false)

          if (status && ["done", "failed", "cancelled"].includes(status)) {
            return
          }

          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current++
            reconnectTimeout = window.setTimeout(() => {
              connectSSE()
            }, 2000 * reconnectAttemptsRef.current)
          }
        }
      }

      eventSource.addEventListener("connected", () => {
        setConnected(true)
      })

      eventSource.addEventListener("status", (e) => {
        try {
          const data: SSEStatusEvent = JSON.parse(e.data)
          setStatus(data.status)
        } catch (err) {
          console.error("Error parsing status event:", err)
        }
      })

      eventSource.addEventListener("progress", (e) => {
        try {
          const data: SSEProgressEvent = JSON.parse(e.data)
          setProgress({
            done: data.done,
            total: data.total,
            percent: data.percent,
          })
        } catch (err) {
          console.error("Error parsing progress event:", err)
        }
      })

      eventSource.addEventListener("log", (e) => {
        try {
          const data: SSELogEvent = JSON.parse(e.data)
          setLogs((prev) => {
            // Avoid duplicates
            const isDuplicate = prev.some(
              (log) => log.ts === data.ts && log.msg === data.msg
            )
            if (isDuplicate) return prev
            return [...prev, data]
          })
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
  }, [storeId, jobId, token, enabled, status])

  return {
    status,
    progress,
    logs,
    connected,
  }
}

