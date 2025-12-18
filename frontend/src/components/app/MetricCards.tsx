import { JobMetrics } from "../../api/types"
import { Card, CardContent } from "../ui/card"
import { useTranslation } from "react-i18next"

interface MetricCardsProps {
  metrics?: JobMetrics
}

export function MetricCards({ metrics }: MetricCardsProps) {
  const { t } = useTranslation()

  if (!metrics) return null

  return (
    <div className="grid grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4 text-center">
          <div className="font-bold text-green-600 dark:text-green-400 text-lg">
            {metrics.success}
          </div>
          <div className="text-xs text-muted-foreground">
            {t("job.metrics.success")}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <div className="font-bold text-destructive text-lg">
            {metrics.failed}
          </div>
          <div className="text-xs text-muted-foreground">
            {t("job.metrics.failed")}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <div className="font-bold text-yellow-600 dark:text-yellow-400 text-lg">
            {metrics.retried}
          </div>
          <div className="text-xs text-muted-foreground">
            {t("job.metrics.retried")}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <div className="font-bold text-muted-foreground text-lg">
            {metrics.skipped}
          </div>
          <div className="text-xs text-muted-foreground">
            {t("job.metrics.skipped")}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

