// ZIP Upload Card Component

import { useTranslation } from "react-i18next"
import { Upload, FileArchive } from "lucide-react"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Skeleton } from "./ui/skeleton"
import { TopProgressBar } from "./ui/top-progress-bar"

interface ZipUploadCardProps {
  onFileSelect: (file: File) => void
  isUploading: boolean
  uploadProgress: number
  isAnalyzing: boolean
  error: string | null
}

export function ZipUploadCard({
  onFileSelect,
  isUploading,
  uploadProgress,
  isAnalyzing,
  error,
}: ZipUploadCardProps) {
  const { t } = useTranslation()
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onFileSelect(file)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileArchive className="h-5 w-5" />
          {t("descBuilder.upload.title")}
        </CardTitle>
        <CardDescription>
          {t("descBuilder.upload.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <TopProgressBar active={isUploading} />
        
        {isAnalyzing && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Skeleton className="h-4 w-4 rounded-full" />
              {t("descBuilder.upload.analyzing")}
            </div>
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!isAnalyzing && (
          <div className="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed p-8">
            <Upload className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">{t("descBuilder.upload.clickToUpload")}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("descBuilder.upload.maxSize")}
              </p>
            </div>
            <Button
              type="button"
              onClick={() => document.getElementById("zip-upload")?.click()}
              disabled={isUploading}
            >
              {t("descBuilder.upload.selectFile")}
            </Button>
            <input
              id="zip-upload"
              type="file"
              accept=".zip"
              onChange={handleFileChange}
              className="hidden"
              disabled={isUploading}
            />
          </div>
        )}

        {isUploading && !isAnalyzing && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{t("descBuilder.upload.uploading")}</span>
              <span>{Math.round(uploadProgress)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

