import { Briefcase } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { PageHeader } from "../components/app/PageHeader"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { useJobManager } from "../state/jobManager"

export function Dashboard() {
  const { t } = useTranslation()
  const { jobs, openDrawer } = useJobManager()
  const navigate = useNavigate()

  const jobList = Array.from(jobs.values())
  const recentJobs = jobList
    .sort((a, b) => {
      const aTime = a.updatedAt || a.startedAt || ""
      const bTime = b.updatedAt || b.startedAt || ""
      return bTime.localeCompare(aTime)
    })
    .slice(0, 5)

  const activeJobs = jobList.filter(
    (job) => !["done", "failed", "cancelled"].includes(job.status)
  )

  return (
    <div>
      <PageHeader
        title={t("pages.dashboard.title")}
      />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("pages.jobs.activeJobs")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{activeJobs.length}</div>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => navigate("/jobs")}
            >
              {t("common.view")} →
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("pages.dashboard.recentJobs")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("pages.jobs.allJobs")}
                </p>
              ) : (
                recentJobs.map((job) => (
                  <div
                    key={job.jobId}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="font-mono text-xs">
                      {job.jobId.substring(0, 8)}...
                    </span>
                    <span className="text-muted-foreground">
                      {t(`job.status.${job.status}`)}
                    </span>
                  </div>
                ))
              )}
            </div>
            <Button
              variant="outline"
              className="mt-4 w-full"
              onClick={openDrawer}
            >
              <Briefcase className="h-4 w-4 mr-2" />
              {t("topBar.jobs")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("pages.dashboard.quickActions")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => navigate("/update-prices")}
              >
                {t("nav.updatePrices")}
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => navigate("/single")}
              >
                {t("nav.single")}
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => navigate("/bulk-fields")}
              >
                {t("nav.bulkFields")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
