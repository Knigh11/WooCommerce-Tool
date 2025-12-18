import { AnimatePresence, motion } from "framer-motion"
import { Pause, Square, Trash2, X } from "lucide-react"
import * as React from "react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { apiFetch } from "../../api/client"
import { endpoints } from "../../api/endpoints"
import { useJobEventsSSE } from "../../hooks/useJobEventsSSE"
import { useJobStatus } from "../../hooks/useJobStatus"
import { useJobManager } from "../../state/jobManager"
import { Button } from "../ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { JobLogConsole } from "./JobLogConsole"
import { MetricCards } from "./MetricCards"

export function JobDrawer() {
  const { t } = useTranslation()
  const {
    jobs,
    isDrawerOpen,
    closeDrawer,
    getJob,
    updateJob,
  } = useJobManager()
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const jobList = Array.from(jobs.values())
  const activeJobs = jobList.filter(
    (job) => !["done", "failed", "cancelled"].includes(job.status)
  )
  const completedJobs = jobList.filter((job) =>
    ["done", "failed", "cancelled"].includes(job.status)
  )

  // Use first active job or first completed job as default
  React.useEffect(() => {
    if (!selectedJobId && jobList.length > 0) {
      const firstActive = activeJobs[0]?.jobId
      const firstCompleted = completedJobs[0]?.jobId
      setSelectedJobId(firstActive || firstCompleted || null)
    }
  }, [selectedJobId, jobList.length])

  const selectedJob = selectedJobId ? getJob(selectedJobId) : null

  // Connect SSE for selected job - luôn enabled khi drawer mở để đảm bảo logs real-time
  useJobEventsSSE({
    storeId: selectedJob?.storeId || null,
    jobId: selectedJobId,
    enabled: isDrawerOpen && !!selectedJobId, // Chỉ kết nối khi drawer mở để đảm bảo logs real-time
  })

  // Polling fallback cho status/progress nếu SSE không hoạt động
  // Logs chỉ lấy từ SSE để đảm bảo real-time
  const { data: jobStatus } = useJobStatus(
    selectedJob?.storeId || null,
    selectedJobId
  )

  // Update status/progress từ polling nếu SSE không hoạt động
  React.useEffect(() => {
    if (!selectedJobId || !jobStatus) return
    const job = getJob(selectedJobId)

    // Chỉ update status/progress từ polling nếu SSE không kết nối
    if (job && !job.sseConnected && jobStatus) {
      updateJob(selectedJobId, {
        status: jobStatus.status as any,
        progress: jobStatus.progress,
        metrics: jobStatus.metrics,
        current: jobStatus.current,
      })
    }
  }, [jobStatus, selectedJobId, getJob, updateJob])

  const handleCancel = async (jobId: string, storeId: string) => {
    try {
      await apiFetch(endpoints.cancelJob(storeId, jobId), { method: "POST" })
      updateJob(jobId, { status: "cancelled" })
      toast.success(t("job.cancel"))
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel job")
    }
  }

  const handlePause = async (jobId: string, storeId: string) => {
    try {
      await apiFetch(endpoints.pauseJob(storeId, jobId), { method: "POST" })
      toast.success(t("job.pause"))
    } catch (err: any) {
      toast.error(err.message || "Failed to pause job")
    }
  }

  const handleStop = async (jobId: string, storeId: string) => {
    if (!window.confirm(t("common.confirm"))) return
    try {
      await apiFetch(endpoints.stopJob(storeId, jobId), { method: "POST" })
      updateJob(jobId, { status: "cancelled" })
      toast.success(t("job.stop"))
    } catch (err: any) {
      toast.error(err.message || "Failed to stop job")
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

  return (
    <AnimatePresence>
      {isDrawerOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeDrawer}
            className="fixed inset-0 bg-black/50 z-40"
          />
          {/* Drawer */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 h-[80vh] bg-background border-t rounded-t-lg z-50 flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">{t("job.logs")}</h2>
              <Button variant="ghost" size="icon" onClick={closeDrawer}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-hidden flex">
              {/* Job List Sidebar */}
              <div className="w-64 border-r overflow-y-auto p-2">
                <div className="space-y-1">
                  {activeJobs.length > 0 && (
                    <>
                      <div className="text-xs font-semibold text-muted-foreground px-2 py-1">
                        {t("pages.jobs.activeJobs")}
                      </div>
                      {activeJobs.map((job) => (
                        <button
                          key={job.jobId}
                          onClick={() => setSelectedJobId(job.jobId)}
                          className={`
                            w-full text-left px-3 py-2 rounded-md text-sm
                            ${selectedJobId === job.jobId
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-accent"
                            }
                          `}
                        >
                          <div className="font-medium truncate">
                            {job.jobId.substring(0, 8)}...
                          </div>
                          <div className={`text-xs ${getStatusColor(job.status)}`}>
                            {t(`job.status.${job.status}`)}
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                  {completedJobs.length > 0 && (
                    <>
                      <div className="text-xs font-semibold text-muted-foreground px-2 py-1 mt-4">
                        {t("pages.jobs.completedJobs")}
                      </div>
                      {completedJobs.map((job) => (
                        <button
                          key={job.jobId}
                          onClick={() => setSelectedJobId(job.jobId)}
                          className={`
                            w-full text-left px-3 py-2 rounded-md text-sm
                            ${selectedJobId === job.jobId
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-accent"
                            }
                          `}
                        >
                          <div className="font-medium truncate">
                            {job.jobId.substring(0, 8)}...
                          </div>
                          <div className={`text-xs ${getStatusColor(job.status)}`}>
                            {t(`job.status.${job.status}`)}
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                  {jobList.length === 0 && (
                    <div className="text-sm text-muted-foreground px-2 py-4 text-center">
                      {t("pages.jobs.allJobs")}
                    </div>
                  )}
                </div>
              </div>

              {/* Job Details */}
              <div className="flex-1 overflow-y-auto p-4">
                {selectedJob ? (
                  <div className="space-y-4">
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle>
                            Job: {selectedJob.jobId.substring(0, 16)}...
                          </CardTitle>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm font-medium ${getStatusColor(
                                selectedJob.status
                              )}`}
                            >
                              {t(`job.status.${selectedJob.status}`)}
                            </span>
                            {selectedJob.sseConnected && (
                              <span className="text-xs text-green-600 dark:text-green-400">
                                ● {t("job.sseConnected")}
                              </span>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Progress */}
                        {selectedJob.progress && (
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>
                                {t("job.progress")}: {selectedJob.progress.done} /{" "}
                                {selectedJob.progress.total}
                              </span>
                              <span>{selectedJob.progress.percent}%</span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2">
                              <div
                                className="bg-primary h-2 rounded-full transition-all"
                                style={{
                                  width: `${selectedJob.progress.percent}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Metrics */}
                        <MetricCards metrics={selectedJob.metrics} />

                        {/* Current */}
                        {selectedJob.current &&
                          (selectedJob.current.product_id ||
                            selectedJob.current.action) && (
                            <div className="p-2 bg-muted rounded text-sm">
                              <strong>{t("job.current")}:</strong>{" "}
                              {selectedJob.current.action || "Processing"}{" "}
                              {selectedJob.current.product_id &&
                                `Product ${selectedJob.current.product_id}`}
                            </div>
                          )}

                        {/* Actions */}
                        {!["done", "failed", "cancelled"].includes(
                          selectedJob.status
                        ) && (
                            <div className="flex gap-2">
                              {selectedJob.status === "running" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    handlePause(selectedJob.jobId, selectedJob.storeId)
                                  }
                                >
                                  <Pause className="h-4 w-4 mr-2" />
                                  {t("job.pause")}
                                </Button>
                              )}
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() =>
                                  handleStop(selectedJob.jobId, selectedJob.storeId)
                                }
                              >
                                <Square className="h-4 w-4 mr-2" />
                                {t("job.stop")}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  handleCancel(selectedJob.jobId, selectedJob.storeId)
                                }
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                {t("job.cancel")}
                              </Button>
                            </div>
                          )}
                      </CardContent>
                    </Card>

                    {/* Logs */}
                    <JobLogConsole
                      logs={selectedJob.logs}
                      autoScroll={autoScroll}
                      onToggleAutoScroll={() => setAutoScroll(!autoScroll)}
                      onClear={() => updateJob(selectedJob.jobId, { logs: [] })}
                    />
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    {t("pages.jobs.allJobs")}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

