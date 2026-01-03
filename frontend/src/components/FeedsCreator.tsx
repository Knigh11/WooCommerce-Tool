import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ChevronDown, ChevronUp } from "lucide-react"
import { useCreateFeedJob } from "../hooks/useFeeds"
import { getStoreApiKey } from "../utils/storeKey"
import { getFeedDefaults, saveFeedDefaults, FeedDefaults } from "../utils/feedDefaults"
import { FeedJobCreateRequest } from "../api/v2/feeds"
import { CategorySelector } from "./CategorySelector"
import { SheetsSettingsPanel } from "./SheetsSettingsPanel"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"
import { Textarea } from "./ui/textarea"
import { Checkbox } from "./ui/checkbox"

interface FeedsCreatorProps {
  storeId: string | null
  onJobCreated?: (jobId: string, token?: string) => void
}

export function FeedsCreator({ storeId, onJobCreated }: FeedsCreatorProps) {
  const { t } = useTranslation()
  const createJob = useCreateFeedJob(storeId)

  // Collapsible sections state
  const [expandedSections, setExpandedSections] = useState({
    channel: true,
    filters: true,
    defaults: true,
    export: true,
  })

  // Form state
  const [channel, setChannel] = useState<"gmc" | "bing" | "both">("gmc")
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [afterDate, setAfterDate] = useState<string>("")
  const [productLimit, setProductLimit] = useState<string>("")
  const [productIds, setProductIds] = useState<string>("")
  const [googleCategory, setGoogleCategory] = useState<string>("")
  const [productType, setProductType] = useState<string>("General Merchandise")
  const [gender, setGender] = useState<string>("")
  const [ageGroup, setAgeGroup] = useState<string>("")
  
  // Export options
  const [xmlExport, setXmlExport] = useState(true)
  const [sheetsExport, setSheetsExport] = useState(false)
  
  // Sheets settings
  const [sheetId, setSheetId] = useState<string>("")
  const [tabName, setTabName] = useState<string>("Products")
  const [credentialsJson, setCredentialsJson] = useState<string>("")
  
  // Save defaults
  const [saveAsDefaults, setSaveAsDefaults] = useState(false)

  const [errors, setErrors] = useState<Record<string, string>>({})

  // Load defaults when storeId changes
  useEffect(() => {
    if (!storeId) return
    
    const defaults = getFeedDefaults(storeId)
    if (defaults) {
      if (defaults.google_category) setGoogleCategory(defaults.google_category)
      if (defaults.product_type) setProductType(defaults.product_type)
      if (defaults.gender) setGender(defaults.gender)
      if (defaults.age_group) setAgeGroup(defaults.age_group)
      if (defaults.category_id !== undefined) setSelectedCategoryId(defaults.category_id)
      if (defaults.sheets) {
        if (defaults.sheets.sheet_id) setSheetId(defaults.sheets.sheet_id)
        if (defaults.sheets.tab_name) setTabName(defaults.sheets.tab_name)
        if (defaults.sheets.credentials_json_base64) {
          try {
            const decoded = atob(defaults.sheets.credentials_json_base64)
            setCredentialsJson(decoded)
          } catch {
            // Ignore decode errors
          }
        }
      }
    }
  }, [storeId])

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  const handleSaveDefaults = () => {
    if (!storeId) {
      toast.error(t("feeds.errors.storeIdRequired"))
      return
    }

    const defaults: FeedDefaults = {
      google_category: googleCategory.trim() || null,
      product_type: productType.trim() || null,
      gender: gender || null,
      age_group: ageGroup || null,
      category_id: selectedCategoryId,
      sheets: sheetsExport
        ? {
            sheet_id: sheetId.trim() || undefined,
            tab_name: tabName.trim() || undefined,
            credentials_json_base64: credentialsJson.trim()
              ? btoa(credentialsJson.trim())
              : undefined,
          }
        : undefined,
    }

    saveFeedDefaults(storeId, defaults)
    toast.success(t("feeds.toast.defaultsSaved"))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    if (!storeId) {
      toast.error(t("feeds.errors.storeIdRequired"))
      return
    }

    const storeKey = getStoreApiKey(storeId)
    if (!storeKey) {
      toast.error(t("feeds.errors.missingStoreKey"))
      return
    }

    // Validate required fields
    if (!googleCategory.trim()) {
      setErrors({ googleCategory: t("feeds.errors.googleCategoryRequired") })
      return
    }

    // Validate product limit
    const limitNum = productLimit ? parseInt(productLimit, 10) : 0
    if (isNaN(limitNum) || limitNum < 0) {
      setErrors({ productLimit: t("feeds.errors.productLimitInvalid") })
      return
    }

    // Validate Sheets settings if Sheets export is enabled
    if (sheetsExport) {
      if (!sheetId.trim()) {
        setErrors({ sheetId: t("feeds.errors.sheetsIdRequired") })
        return
      }
      if (!credentialsJson.trim()) {
        setErrors({ credentials: t("feeds.errors.sheetsCredentialsRequired") })
        return
      }
    }

    // Parse product IDs
    const parsedProductIds = productIds
      .split(/[,\n\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => parseInt(s, 10))
      .filter((n) => !isNaN(n))

    // Build sheets_config if sheets export is enabled
    let sheetsConfig = null
    if (sheetsExport && sheetId.trim() && credentialsJson.trim()) {
      // Convert credentials JSON to base64
      try {
        // Validate JSON first
        JSON.parse(credentialsJson)
        const credentialsBase64 = btoa(credentialsJson)
        sheetsConfig = {
          sheet_id: sheetId.trim(),
          tab_name: tabName.trim() || "Products",
          credentials_json_base64: credentialsBase64,
        }
      } catch (e) {
        setErrors({ credentials: t("feeds.errors.sheetsCredentialsInvalid") })
        return
      }
    }

    const payload: FeedJobCreateRequest = {
      channel,
      filters: {
        category_id: selectedCategoryId,
        after_date: afterDate || null,
        product_limit: limitNum > 0 ? limitNum : null,
        product_ids: parsedProductIds.length > 0 ? parsedProductIds : null,
      },
      defaults: {
        google_category: googleCategory.trim() || null,
        product_type: productType.trim() || null,
        gender: gender || null,
        age_group: ageGroup || null,
      },
      export: {
        xml: xmlExport,
        sheets: sheetsExport,
        sheets_config: sheetsConfig,
      },
    }

    try {
      const result = await createJob.mutateAsync(payload)
      toast.success(t("feeds.toast.started"))
      
      // Save defaults if requested
      if (saveAsDefaults) {
        handleSaveDefaults()
      }
      
      // Extract token from sse_url if not in response
      let token = result.token
      if (!token && result.sse_url) {
        const { extractTokenFromSseUrl } = await import("../api/v2/feeds")
        token = extractTokenFromSseUrl(result.sse_url) || undefined
      }
      
      if (onJobCreated) {
        onJobCreated(result.job_id, token)
      }
    } catch (error: any) {
      const message =
        error.message || error.status === 403
          ? t("feeds.errors.unauthorized")
          : t("feeds.errors.createFailed")
      toast.error(message)
    }
  }

  // Preview config
  const getPreviewConfig = () => {
    const categoryDisplay =
      selectedCategoryId === null
        ? t("feeds.filters.categoryAll")
        : `Category ID: ${selectedCategoryId}`
    
    const exportTargets = []
    if (xmlExport) exportTargets.push("XML")
    if (sheetsExport) exportTargets.push("Sheets")

    return {
      channel: t(`feeds.create.channel.${channel}`),
      category: categoryDisplay,
      afterDate: afterDate || t("common.none"),
      limit: productLimit || "0 (all)",
      exportTargets: exportTargets.join(", ") || t("common.none"),
    }
  }

  const preview = getPreviewConfig()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("feeds.create.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Channel Section */}
          <div className="border rounded-lg">
            <button
              type="button"
              onClick={() => toggleSection("channel")}
              className="w-full flex items-center justify-between p-4 hover:bg-muted/50"
            >
              <Label className="text-base font-semibold cursor-pointer">
                {t("feeds.create.channel.label")}
              </Label>
              {expandedSections.channel ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {expandedSections.channel && (
              <div className="px-4 pb-4">
                <Select value={channel} onValueChange={(v: any) => setChannel(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gmc">{t("feeds.create.channel.gmc")}</SelectItem>
                    <SelectItem value="bing">{t("feeds.create.channel.bing")}</SelectItem>
                    <SelectItem value="both">{t("feeds.create.channel.both")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Filters Section */}
          <div className="border rounded-lg">
            <button
              type="button"
              onClick={() => toggleSection("filters")}
              className="w-full flex items-center justify-between p-4 hover:bg-muted/50"
            >
              <Label className="text-base font-semibold cursor-pointer">
                {t("feeds.filters.title")}
              </Label>
              {expandedSections.filters ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {expandedSections.filters && (
              <div className="px-4 pb-4 space-y-4">
                <div>
                  <Label>{t("feeds.filters.category")}</Label>
                  <CategorySelector
                    storeId={storeId}
                    selectedCategoryId={selectedCategoryId}
                    onSelect={setSelectedCategoryId}
                    showAllOption={true}
                    height={10}
                  />
                </div>

                <div>
                  <Label>{t("feeds.filters.afterDate")}</Label>
                  <Input
                    type="datetime-local"
                    value={afterDate}
                    onChange={(e) => setAfterDate(e.target.value)}
                  />
                </div>

                <div>
                  <Label>{t("feeds.filters.productLimit")}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={productLimit}
                    onChange={(e) => setProductLimit(e.target.value)}
                    placeholder={t("feeds.filters.productLimitPlaceholder")}
                  />
                  {errors.productLimit && (
                    <p className="text-sm text-destructive mt-1">{errors.productLimit}</p>
                  )}
                </div>

                <div>
                  <Label>{t("feeds.filters.productIds")}</Label>
                  <Textarea
                    value={productIds}
                    onChange={(e) => setProductIds(e.target.value)}
                    placeholder={t("feeds.filters.productIdsPlaceholder")}
                    rows={3}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Defaults Section */}
          <div className="border rounded-lg">
            <button
              type="button"
              onClick={() => toggleSection("defaults")}
              className="w-full flex items-center justify-between p-4 hover:bg-muted/50"
            >
              <Label className="text-base font-semibold cursor-pointer">
                {t("feeds.defaults.title")}
              </Label>
              {expandedSections.defaults ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {expandedSections.defaults && (
              <div className="px-4 pb-4 space-y-4">
                <div>
                  <Label>
                    {t("feeds.defaults.googleCategory")} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={googleCategory}
                    onChange={(e) => setGoogleCategory(e.target.value)}
                    placeholder={t("feeds.defaults.googleCategoryPlaceholder")}
                    required
                  />
                  {errors.googleCategory && (
                    <p className="text-sm text-destructive mt-1">{errors.googleCategory}</p>
                  )}
                </div>

                <div>
                  <Label>{t("feeds.defaults.productType")}</Label>
                  <Input
                    value={productType}
                    onChange={(e) => setProductType(e.target.value)}
                    placeholder={t("feeds.defaults.productTypePlaceholder")}
                  />
                </div>

                <div>
                  <Label>{t("feeds.defaults.gender")}</Label>
                  <Select
                    value={gender || "__none__"}
                    onValueChange={(v) => setGender(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("common.optional")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t("common.none")}</SelectItem>
                      <SelectItem value="unisex">Unisex</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>{t("feeds.defaults.ageGroup")}</Label>
                  <Select
                    value={ageGroup || "__none__"}
                    onValueChange={(v) => setAgeGroup(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("common.optional")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t("common.none")}</SelectItem>
                      <SelectItem value="adult">Adult</SelectItem>
                      <SelectItem value="kids">Kids</SelectItem>
                      <SelectItem value="toddler">Toddler</SelectItem>
                      <SelectItem value="infant">Infant</SelectItem>
                      <SelectItem value="newborn">Newborn</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          {/* Export Targets Section */}
          <div className="border rounded-lg">
            <button
              type="button"
              onClick={() => toggleSection("export")}
              className="w-full flex items-center justify-between p-4 hover:bg-muted/50"
            >
              <Label className="text-base font-semibold cursor-pointer">
                {t("feeds.export.title")}
              </Label>
              {expandedSections.export ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {expandedSections.export && (
              <div className="px-4 pb-4 space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="xmlExport"
                    checked={xmlExport}
                    onCheckedChange={(checked) => setXmlExport(checked === true)}
                  />
                  <Label htmlFor="xmlExport" className="font-normal cursor-pointer">
                    {t("feeds.export.xml")}
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="sheetsExport"
                    checked={sheetsExport}
                    onCheckedChange={(checked) => setSheetsExport(checked === true)}
                  />
                  <Label htmlFor="sheetsExport" className="font-normal cursor-pointer">
                    {t("feeds.export.sheets")}
                  </Label>
                </div>

                {sheetsExport && (
                  <SheetsSettingsPanel
                    sheetId={sheetId}
                    tabName={tabName}
                    credentialsJson={credentialsJson}
                    onSheetIdChange={setSheetId}
                    onTabNameChange={setTabName}
                    onCredentialsChange={setCredentialsJson}
                    errors={{
                      sheetId: errors.sheetId,
                      credentials: errors.credentials,
                    }}
                  />
                )}
              </div>
            )}
          </div>

          {/* Preview Config */}
          <Card className="bg-muted/50">
            <CardHeader>
              <CardTitle className="text-sm">{t("feeds.preview.title")}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div>
                <span className="font-medium">{t("feeds.preview.channel")}:</span> {preview.channel}
              </div>
              <div>
                <span className="font-medium">{t("feeds.preview.category")}:</span> {preview.category}
              </div>
              <div>
                <span className="font-medium">{t("feeds.preview.afterDate")}:</span> {preview.afterDate}
              </div>
              <div>
                <span className="font-medium">{t("feeds.preview.limit")}:</span> {preview.limit}
              </div>
              <div>
                <span className="font-medium">{t("feeds.preview.exportTargets")}:</span> {preview.exportTargets}
              </div>
            </CardContent>
          </Card>

          {/* Save as defaults */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="saveAsDefaults"
              checked={saveAsDefaults}
              onCheckedChange={(checked) => setSaveAsDefaults(checked === true)}
            />
            <Label htmlFor="saveAsDefaults" className="font-normal cursor-pointer">
              {t("feeds.create.saveDefaults")}
            </Label>
          </div>

          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={createJob.isPending}
              className="flex-1"
            >
              {createJob.isPending
                ? t("common.loading")
                : t("feeds.create.submit")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveDefaults}
              disabled={!storeId}
            >
              {t("feeds.create.saveDefaults")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
