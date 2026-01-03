// Generic SSE Job Hook

import { useEffect, useRef } from "react"

interface UseSseJobOptions {
  url: string | null
  enabled?: boolean
  onEvent?: (event: MessageEvent) => void
  onError?: (error: Event) => void
  onOpen?: () => void
}

export function useSseJob({
  url,
  enabled = true,
  onEvent,
  onError,
  onOpen,
}: UseSseJobOptions) {
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!enabled || !url) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      return
    }

    const eventSource = new EventSource(url)
    eventSourceRef.current = eventSource

    if (onOpen) {
      eventSource.onopen = onOpen
    }

    if (onError) {
      eventSource.onerror = onError
    }

    // Handle all event types (status, progress, log, error, message)
    const handleEvent = (e: MessageEvent) => {
      if (onEvent) {
        onEvent(e)
      }
    }

    // Listen to specific event types
    eventSource.addEventListener("status", handleEvent)
    eventSource.addEventListener("progress", handleEvent)
    eventSource.addEventListener("log", handleEvent)
    eventSource.addEventListener("error", handleEvent)
    eventSource.addEventListener("message", handleEvent)
    eventSource.addEventListener("connected", handleEvent)

    // Also handle generic message events
    eventSource.onmessage = handleEvent

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [url, enabled, onEvent, onError, onOpen])

  return {
    close: () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    },
  }
}

