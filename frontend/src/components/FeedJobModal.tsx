import { Download } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { getFeedDownloadUrl } from "../api/v2/feeds"
import { useFeedJobEventsSSE } from "../hooks/useFeedJobEventsSSE"
import { useFeedJob } from "../hooks/useFeeds"
import { getClientSession } from "../utils/clientSession"
import { getStoreApiKey } from "../utils/storeKey"
import { JobLogConsole } from "./app/JobLogConsole"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog"

interface FeedJobModalProps {
  storeId: string | null
  jobId: string | null
  token?: string
  onClose: () => void
}

export function FeedJobModal({
  storeId,
  jobId,
  token,
  onClose,
}: FeedJobModalProps) {
  const { t } = useTranslation()
  const { data: job, isLoading } = useFeedJob(storeId, jobId)
  const [autoScroll, setAutoScroll] = useState(true)

  // Use provided token or try to extract from job's sse_url if available
  const effectiveToken = token || (job?.outputs ? undefined : undefined) // Token should come from props

  const { status: sseStatus, progress: sseProgress, logs: sseLogs, connected } =
    useFeedJobEventsSSE({
      storeId,
      jobId,
      token: effectiveToken,
      enabled: !!storeId && !!jobId,
    })

  // Use job data or SSE data
  const displayStatus = job?.status || sseStatus || "unknown"
  const displayProgress = job?.progress || sseProgress
  const displayLogs = sseLogs || []

  const getStatusColor = (status: string) => {
    switch (status) {
      case "done":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
      case "failed":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
      case "cancelled":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
      case "running":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
    }
  }

  const handleDownload = async () => {
    if (!storeId || !jobId) return

    const downloadUrl = getFeedDownloadUrl(storeId, jobId)
    const clientSession = getClientSession()
    const storeKey = getStoreApiKey(storeId)

    try {
      const response = await fetch(downloadUrl, {
        headers: {
          "X-Client-Session": clientSession,
          "X-Store-Key": storeKey || "",
        },
      })

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`)
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url

      // Extract filename from Content-Disposition header or fallback to job outputs
      const { extractFilenameFromContentDisposition, normalizeXmlFilename } = await import("../utils/filename")
      const contentDisposition = response.headers.get("content-disposition")
      let filename = "feed.xml"

      if (contentDisposition) {
        const extracted = extractFilenameFromContentDisposition(contentDisposition)
        if (extracted) {
          filename = extracted
        }
      } else if (job?.outputs?.xml_filename) {
        filename = job.outputs.xml_filename
      } else if (job?.outputs?.zip_filename) {
        filename = job.outputs.zip_filename
      }

      // Normalize filename to ensure it ends with .xml and is Chrome-safe
      a.download = normalizeXmlFilename(filename)
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error: any) {
      console.error("Download error:", error)
      window.open(downloadUrl, "_blank")
    }
  }

  if (isLoading && !job) {
    return (
      <Dialog open={!!jobId} onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("feeds.modal.loading")}</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  const isDone = ["done", "failed", "cancelled"].includes(displayStatus)

  return (
    <Dialog open={!!jobId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>
              {t("feeds.modal.title")}: {jobId?.substring(0, 16)}...
            </span>
            <div className="flex items-center gap-2">
              <Badge className={getStatusColor(displayStatus)}>
                {t(`job.status.${displayStatus}`)}
              </Badge>
              {connected && (
                <span className="text-xs text-green-600 dark:text-green-400">
                  ● {t("job.sseConnected")}
                </span>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Progress */}
          {displayProgress && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  {t("job.progress")}: {displayProgress.done} /{" "}
                  {displayProgress.total} ({displayProgress.percent}%)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${displayProgress.percent}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Job Info */}
          {job && (
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <strong>{t("feeds.modal.itemsCount")}:</strong>{" "}
                    {job.items_count || "-"}
                  </div>
                  {job.created_at && (
                    <div>
                      <strong>{t("feeds.jobs.created")}:</strong>{" "}
                      {new Date(job.created_at).toLocaleString()}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          {isDone && job && (
            <div className="flex gap-2">
              <Button onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                {t("feeds.modal.download")}
              </Button>
            </div>
          )}

          {/* Logs */}
          <JobLogConsole
            logs={displayLogs}
            autoScroll={autoScroll}
            onToggleAutoScroll={() => setAutoScroll(!autoScroll)}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

