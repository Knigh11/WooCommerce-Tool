import { PageHeader } from "../components/app/PageHeader"
import { useTranslation } from "react-i18next"
import { useJobManager } from "../state/jobManager"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { Button } from "../components/ui/button"
import { EmptyState } from "../components/common/EmptyState"
import { Briefcase } from "lucide-react"

export function Jobs() {
  const { t } = useTranslation()
  const { jobs, openDrawer } = useJobManager()

  const jobList = Array.from(jobs.values())
  const activeJobs = jobList.filter(
    (job) => !["done", "failed", "cancelled"].includes(job.status)
  )
  const completedJobs = jobList.filter((job) =>
    ["done", "failed", "cancelled"].includes(job.status)
  )

  return (
    <div>
      <PageHeader
        title={t("pages.jobs.title")}
        actions={
          <Button onClick={openDrawer}>
            <Briefcase className="h-4 w-4 mr-2" />
            {t("topBar.jobs")}
          </Button>
        }
      />

      {jobList.length === 0 ? (
        <EmptyState
          title={t("pages.jobs.allJobs")}
          description="Create a job to get started"
        />
      ) : (
        <div className="space-y-4">
          {activeJobs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("pages.jobs.activeJobs")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {activeJobs.map((job) => (
                    <div
                      key={job.jobId}
                      className="flex items-center justify-between p-2 border rounded"
                    >
                      <span className="font-mono text-sm">
                        {job.jobId.substring(0, 16)}...
                      </span>
                      <span className="text-sm">
                        {t(`job.status.${job.status}`)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {completedJobs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("pages.jobs.completedJobs")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {completedJobs.map((job) => (
                    <div
                      key={job.jobId}
                      className="flex items-center justify-between p-2 border rounded"
                    >
                      <span className="font-mono text-sm">
                        {job.jobId.substring(0, 16)}...
                      </span>
                      <span className="text-sm">
                        {t(`job.status.${job.status}`)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

