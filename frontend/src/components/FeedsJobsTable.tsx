import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Download, Eye } from "lucide-react"
import { useFeedJobs } from "../hooks/useFeeds"
import { FeedJobDetail } from "../api/v2/feeds"
import { getFeedDownloadUrl } from "../api/v2/feeds"
import { getClientSession } from "../utils/clientSession"
import { getStoreApiKey } from "../utils/storeKey"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Input } from "./ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table"
import { Skeleton } from "./ui/skeleton"
import { EmptyState } from "./common/EmptyState"

interface FeedsJobsTableProps {
  storeId: string | null
  onViewJob?: (jobId: string) => void
}

export function FeedsJobsTable({
  storeId,
  onViewJob,
}: FeedsJobsTableProps) {
  const { t } = useTranslation()
  const { data: jobs, isLoading } = useFeedJobs(storeId)
  const [searchQuery, setSearchQuery] = useState("")

  const filteredJobs =
    jobs?.filter((job) =>
      job.job_id.toLowerCase().includes(searchQuery.toLowerCase())
    ) || []

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

  const handleDownload = async (job: FeedJobDetail) => {
    if (!storeId) return

    const downloadUrl = getFeedDownloadUrl(storeId, job.job_id)
    const clientSession = getClientSession()
    const storeKey = getStoreApiKey(storeId)

    // Try to download with fetch to include headers
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

      // Get filename from response headers or use default
      const contentDisposition = response.headers.get("content-disposition")
      let filename = "feed.xml"
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i)
        if (filenameMatch) {
          filename = filenameMatch[1]
        }
      } else if (job.outputs?.xml_filename) {
        filename = job.outputs.xml_filename
      } else if (job.outputs?.zip_filename) {
        filename = job.outputs.zip_filename
      }

      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error: any) {
      console.error("Download error:", error)
      // Fallback: open in new tab
      window.open(downloadUrl, "_blank")
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("feeds.jobs.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{t("feeds.jobs.title")}</CardTitle>
          <Input
            placeholder={t("feeds.jobs.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64"
          />
        </div>
      </CardHeader>
      <CardContent>
        {filteredJobs.length === 0 ? (
          <EmptyState
            title={t("feeds.jobs.empty")}
            description={
              searchQuery
                ? t("feeds.jobs.noResults")
                : t("feeds.jobs.emptyDescription")
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("feeds.jobs.jobId")}</TableHead>
                <TableHead>{t("feeds.jobs.channel")}</TableHead>
                <TableHead>{t("feeds.jobs.created")}</TableHead>
                <TableHead>{t("feeds.jobs.status")}</TableHead>
                <TableHead>{t("feeds.jobs.file")}</TableHead>
                <TableHead>{t("feeds.jobs.items")}</TableHead>
                <TableHead>{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredJobs.map((job) => {
                // Extract channel from job params if available
                const jobParams = (job as any).params || {}
                const channel = jobParams.channel || "-"
                const channelDisplay = channel !== "-" 
                  ? t(`feeds.create.channel.${channel}`)
                  : "-"
                
                return (
                <TableRow key={job.job_id}>
                  <TableCell className="font-mono text-xs">
                    {job.job_id.substring(0, 16)}...
                  </TableCell>
                  <TableCell className="text-sm">
                    {channelDisplay}
                  </TableCell>
                  <TableCell>
                    {job.created_at
                      ? new Date(job.created_at).toLocaleString()
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(job.status)}>
                      {t(`job.status.${job.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {job.outputs?.xml_filename || job.outputs?.zip_filename || "-"}
                  </TableCell>
                  <TableCell>{job.items_count || "-"}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onViewJob?.(job.job_id)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        {t("common.view")}
                      </Button>
                      {job.status === "done" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(job)}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          {t("feeds.modal.download")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

