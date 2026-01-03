// Preview & Generate Panel Component

import { useTranslation } from "react-i18next"
import { Download, Play, RefreshCw } from "lucide-react"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { SkeletonShimmer } from "./ui/skeleton"
import { Textarea } from "./ui/textarea"
import { TopProgressBar } from "./ui/top-progress-bar"

interface PreviewGeneratePanelProps {
  previewText: string | null
  isPreviewLoading: boolean
  previewError: string | null
  onPreview: () => void
  onGenerate: () => void
  isGenerating: boolean
  jobStatus: "idle" | "running" | "done" | "error" | null
  jobProgress: { done: number; total: number } | null
  jobLogs: string[]
  onDownload: () => void
  selectedCount: number
  rootName: string | null
  multipleRoots: boolean
}

export function PreviewGeneratePanel({
  previewText,
  isPreviewLoading,
  previewError,
  onPreview,
  onGenerate,
  isGenerating,
  jobStatus,
  jobProgress,
  jobLogs,
  onDownload,
  selectedCount,
  rootName,
  multipleRoots,
}: PreviewGeneratePanelProps) {
  const { t } = useTranslation()
  const canGenerate = selectedCount > 0 && !isGenerating && jobStatus !== "running"
  const canDownload = jobStatus === "done"

  return (
    <div className="space-y-4">
      {/* Preview Card */}
      <Card>
        <CardHeader>
          <CardTitle>{t("descBuilder.preview.title")}</CardTitle>
          <CardDescription>{t("descBuilder.preview.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={onPreview} disabled={isPreviewLoading || selectedCount === 0} size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${isPreviewLoading ? "animate-spin" : ""}`} />
            {t("descBuilder.preview.refresh")}
          </Button>

          {isPreviewLoading && (
            <div className="space-y-2">
              <SkeletonShimmer className="h-4 w-full" />
              <SkeletonShimmer className="h-4 w-3/4" />
              <SkeletonShimmer className="h-4 w-full" />
              <SkeletonShimmer className="h-4 w-2/3" />
            </div>
          )}

          {previewError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {previewError}
            </div>
          )}

          {!isPreviewLoading && previewText && (
            <Textarea
              value={previewText}
              readOnly
              rows={20}
              className="font-mono text-xs"
            />
          )}

          {!isPreviewLoading && !previewText && !previewError && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("descBuilder.preview.empty")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate Card */}
      <Card>
        <CardHeader>
          <CardTitle>{t("descBuilder.generate.title")}</CardTitle>
          <CardDescription>
            {selectedCount === 1 
              ? t("descBuilder.generate.description", { count: selectedCount })
              : t("descBuilder.generate.descriptionPlural", { count: selectedCount })
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <TopProgressBar active={jobStatus === "running"} />

          {jobProgress && jobStatus === "running" && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{t("descBuilder.generate.generating")}</span>
                <span>
                  {jobProgress.done} / {jobProgress.total}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{
                    width: `${(jobProgress.done / jobProgress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {jobLogs.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-md border bg-muted/50 p-3 font-mono text-xs">
              {jobLogs.slice(-50).map((log, i) => (
                <div key={i} className="whitespace-pre-wrap break-words">
                  {log}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={onGenerate}
              disabled={!canGenerate}
              className="flex-1"
            >
              <Play className="h-4 w-4 mr-2" />
              {selectedCount > 0 
                ? t("descBuilder.generate.buttonWithCount", { count: selectedCount })
                : t("descBuilder.generate.button")
              }
            </Button>

            {canDownload && (
              <Button onClick={onDownload} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                {t("descBuilder.generate.download")}
              </Button>
            )}
          </div>

          {canDownload && (
            <div className="rounded-md border bg-muted/50 p-4 space-y-2 text-sm">
              <p className="font-medium">{t("descBuilder.generate.extractionTitle")}</p>
              {rootName && !multipleRoots ? (
                <div className="space-y-1">
                  <p dangerouslySetInnerHTML={{
                    __html: t("descBuilder.generate.extractionSingleRoot", { rootName })
                  }} />
                  <p className="text-xs text-muted-foreground" dangerouslySetInnerHTML={{
                    __html: t("descBuilder.generate.extractionSingleRootExample", { rootName })
                  }} />
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-orange-600">
                    {t("descBuilder.generate.extractionMultipleRoots")}
                  </p>
                  <p className="text-xs text-muted-foreground" dangerouslySetInnerHTML={{
                    __html: t("descBuilder.generate.extractionMultipleRootsExample")
                  }} />
                </div>
              )}
              <div className="mt-2 p-2 bg-background rounded font-mono text-xs">
                <code>{t("descBuilder.generate.extractionCommand")}</code>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

