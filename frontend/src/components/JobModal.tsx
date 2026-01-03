/**
 * JobModal - Dialog component for displaying job details
 * Similar to JobDrawer but as a modal dialog
 */

import { Pause, Square } from "lucide-react"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { apiFetch } from "../api/client"
import { endpoints } from "../api/endpoints"
import { useJobEventsSSE } from "../hooks/useJobEventsSSE"
import { useJobStatus } from "../hooks/useJobStatus"
import { useJobManager } from "../state/jobManager"
import { JobLogConsole } from "./app/JobLogConsole"
import { MetricCards } from "./app/MetricCards"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog"

interface JobModalProps {
  jobId: string | null
  onClose: () => void
}

export function JobModal({ jobId, onClose }: JobModalProps) {
  const { t } = useTranslation()
  const { getJob, updateJob } = useJobManager()
  const [autoScroll, setAutoScroll] = React.useState(true)

  const job = jobId ? getJob(jobId) : null

  // Connect SSE for the job
  useJobEventsSSE({
    storeId: job?.storeId || null,
    jobId,
    enabled: !!jobId && !!job,
  })

  // Polling fallback
  const { data: jobStatus } = useJobStatus(job?.storeId || null, jobId)

  // Update status/progress from polling if SSE not connected
  React.useEffect(() => {
    if (!jobId || !jobStatus || !job) return
    if (!job.sseConnected && jobStatus) {
      updateJob(jobId, {
        status: jobStatus.status as any,
        progress: jobStatus.progress,
        metrics: jobStatus.metrics,
        current: jobStatus.current,
      })
    }
  }, [jobStatus, jobId, job, updateJob])

  const handlePause = async () => {
    if (!job) return
    try {
      await apiFetch(endpoints.pauseJob(job.storeId, job.jobId), {
        method: "POST",
      })
      toast.success(t("job.pause"))
    } catch (err: any) {
      toast.error(err.message || t("jobMonitor.failedToPause"))
    }
  }

  const handleStop = async () => {
    if (!job) return
    if (!window.confirm(t("common.confirm"))) return
    try {
      await apiFetch(endpoints.stopJob(job.storeId, job.jobId), {
        method: "POST",
      })
      updateJob(job.jobId, { status: "cancelled" })
      toast.success(t("job.stop"))
    } catch (err: any) {
      toast.error(err.message || t("jobMonitor.failedToStop"))
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "done":
        return "text-green-600 dark:text-green-400"
      case "failed":
        return "text-destructive"
      case "cancelled":
        return "text-yellow-600 dark:text-yellow-400"
      case "running":
        return "text-blue-600 dark:text-blue-400"
      default:
        return "text-muted-foreground"
    }
  }

  if (!job) {
    return null
  }

  const isDone = ["done", "failed", "cancelled"].includes(job.status)

  return (
    <Dialog open={!!jobId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{t("job.title")}: {job.jobId.substring(0, 16)}...</span>
            <div className="flex items-center gap-2">
              <span
                className={`text-sm font-medium ${getStatusColor(job.status)}`}
              >
                {t(`job.status.${job.status}`)}
              </span>
              {job.sseConnected && (
                <span className="text-xs text-green-600 dark:text-green-400">
                  ● {t("job.sseConnected")}
                </span>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Progress */}
          {job.progress && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  {t("job.progress")}: {job.progress.done} / {job.progress.total} ({job.progress.percent}%)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${job.progress.percent}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Metrics */}
          {job.metrics && <MetricCards metrics={job.metrics} />}

          {/* Current */}
          {job.current &&
            (job.current.product_id || job.current.action) && (
              <Card>
                <CardContent className="pt-6">
                  <div className="p-2 bg-muted rounded text-sm">
                    <strong>{t("job.current")}:</strong>{" "}
                    {job.current.action || t("job.processing")}{" "}
                    {job.current.product_id &&
                      `${t("logs.product")} ${job.current.product_id}`}
                  </div>
                </CardContent>
              </Card>
            )}

          {/* Actions */}
          {!isDone && (
            <div className="flex gap-2">
              {job.status === "running" && (
                <Button variant="outline" size="sm" onClick={handlePause}>
                  <Pause className="h-4 w-4 mr-2" />
                  {t("job.pause")}
                </Button>
              )}
              <Button variant="destructive" size="sm" onClick={handleStop}>
                <Square className="h-4 w-4 mr-2" />
                {t("job.stop")}
              </Button>
            </div>
          )}

          {/* Logs */}
          <JobLogConsole
            logs={job.logs}
            autoScroll={autoScroll}
            onToggleAutoScroll={() => setAutoScroll(!autoScroll)}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

