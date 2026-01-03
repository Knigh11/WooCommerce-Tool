/**
 * JobCenter - Job management panel
 * Shows running jobs + last 10 finished jobs
 * Click to open job details in JobModal
 */

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Briefcase, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react"
import { useJobManager } from "../state/jobManager"
import { Button } from "./ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover"
import { cn } from "../lib/utils"

interface JobCenterProps {
  variant?: "button" | "icon"
}

export function JobCenter({ variant = "button" }: JobCenterProps) {
  const { t } = useTranslation()
  const { jobs, openModal, activeJobIds } = useJobManager()

  const jobList = Array.from(jobs.values())
  const activeJobs = jobList.filter(
    (job) => !["done", "failed", "cancelled"].includes(job.status)
  )
  const completedJobs = jobList
    .filter((job) => ["done", "failed", "cancelled"].includes(job.status))
    .sort((a, b) => {
      const aTime = a.updatedAt || a.startedAt || ""
      const bTime = b.updatedAt || b.startedAt || ""
      return bTime.localeCompare(aTime) // Most recent first
    })
    .slice(0, 10) // Last 10 finished jobs

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "done":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive" />
      case "cancelled":
        return <AlertCircle className="h-4 w-4 text-yellow-600" />
      case "running":
        return <Clock className="h-4 w-4 text-blue-600 animate-spin" />
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getStatusText = (status: string) => {
    return t(`job.status.${status}`)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={variant === "icon" ? "ghost" : "outline"}
          size={variant === "icon" ? "icon" : "default"}
          className={cn(
            "relative",
            variant === "icon" && "h-9 w-9"
          )}
        >
          <Briefcase className="h-4 w-4" />
          {variant === "button" && <span className="ml-2">{t("topBar.jobs")}</span>}
          {activeJobIds.length > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center">
              {activeJobIds.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-sm">{t("topBar.jobs")}</h3>
          {activeJobIds.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {activeJobIds.length} {t("pages.jobs.activeJobs").toLowerCase()}
            </p>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {activeJobs.length > 0 && (
            <div className="p-2">
              <div className="text-xs font-semibold text-muted-foreground px-2 py-1 mb-1">
                {t("pages.jobs.activeJobs")}
              </div>
              {activeJobs.map((job) => (
                <button
                  key={job.jobId}
                  onClick={() => openModal(job.jobId)}
                  className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors flex items-center gap-2"
                >
                  {getStatusIcon(job.status)}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {job.jobId.substring(0, 12)}...
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {getStatusText(job.status)}
                      {job.progress && (
                        <span className="ml-2">
                          {job.progress.done}/{job.progress.total}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {completedJobs.length > 0 && (
            <div className="p-2 border-t">
              <div className="text-xs font-semibold text-muted-foreground px-2 py-1 mb-1">
                {t("pages.jobs.completedJobs")}
              </div>
              {completedJobs.map((job) => (
                <button
                  key={job.jobId}
                  onClick={() => openModal(job.jobId)}
                  className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors flex items-center gap-2"
                >
                  {getStatusIcon(job.status)}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {job.jobId.substring(0, 12)}...
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {getStatusText(job.status)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {jobList.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {t("pages.jobs.allJobs")}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

