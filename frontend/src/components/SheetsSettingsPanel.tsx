import { useTranslation } from "react-i18next"
import { Label } from "./ui/label"
import { Input } from "./ui/input"
import { Textarea } from "./ui/textarea"
import { Alert, AlertDescription } from "./ui/alert"
import { AlertCircle } from "lucide-react"

interface SheetsSettingsPanelProps {
  sheetId: string
  tabName: string
  credentialsJson: string
  onSheetIdChange: (value: string) => void
  onTabNameChange: (value: string) => void
  onCredentialsChange: (value: string) => void
  errors?: {
    sheetId?: string
    credentials?: string
  }
}

export function SheetsSettingsPanel({
  sheetId,
  tabName,
  credentialsJson,
  onSheetIdChange,
  onTabNameChange,
  onCredentialsChange,
  errors,
}: SheetsSettingsPanelProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
      <h4 className="font-semibold text-sm">{t("feeds.sheets.title")}</h4>
      
      <div>
        <Label>
          {t("feeds.sheets.sheetId")} <span className="text-destructive">*</span>
        </Label>
        <Input
          value={sheetId}
          onChange={(e) => onSheetIdChange(e.target.value)}
          placeholder={t("feeds.sheets.sheetIdPlaceholder")}
        />
        {errors?.sheetId && (
          <p className="text-sm text-destructive mt-1">{errors.sheetId}</p>
        )}
      </div>

      <div>
        <Label>{t("feeds.sheets.tabName")}</Label>
        <Input
          value={tabName}
          onChange={(e) => onTabNameChange(e.target.value)}
          placeholder={t("feeds.sheets.tabNamePlaceholder")}
        />
      </div>

      <div>
        <Label>
          {t("feeds.sheets.credentials")} <span className="text-destructive">*</span>
        </Label>
        <Textarea
          value={credentialsJson}
          onChange={(e) => onCredentialsChange(e.target.value)}
          placeholder={t("feeds.sheets.credentialsPlaceholder")}
          rows={6}
          className="font-mono text-xs"
        />
        {errors?.credentials && (
          <p className="text-sm text-destructive mt-1">{errors.credentials}</p>
        )}
        <Alert className="mt-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            {t("feeds.sheets.credentialsWarning")}
          </AlertDescription>
        </Alert>
        <p className="text-xs text-muted-foreground mt-1">
          {t("feeds.sheets.credentialsInfo")}
        </p>
      </div>
    </div>
  )
}

