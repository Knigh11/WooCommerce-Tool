// Description Config Panel Component

import { useTranslation } from "react-i18next"
import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Textarea } from "./ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Button } from "./ui/button"
import { Config } from "../utils/descriptionBuilderSchemas"
import { listPresets, getPreset, PresetInfo, PresetListResponse } from "../api/descriptionBuilder"
import { useQuery } from "@tanstack/react-query"
import { Skeleton } from "./ui/skeleton"

interface DescConfigPanelProps {
  storeId: string
  config: Config
  onConfigChange: (config: Config) => void
}

export function DescConfigPanel({ storeId, config, onConfigChange }: DescConfigPanelProps) {
  const { t } = useTranslation()
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>("")
  const [presets, setPresets] = useState<PresetInfo[]>([])
  const [defaultTemplate, setDefaultTemplate] = useState<string>("")

  // Load presets
  const { data: presetsData, isLoading: presetsLoading } = useQuery({
    queryKey: ["descBuilderPresets", storeId],
    queryFn: () => listPresets(storeId),
    enabled: !!storeId,
  })

  useEffect(() => {
    if (presetsData) {
      setPresets(presetsData.presets)
      setDefaultTemplate(presetsData.default_template)
    }
  }, [presetsData])

  const handlePresetSelect = async (categoryKey: string) => {
    if (!categoryKey || categoryKey === "none") {
      setSelectedPresetKey("")
      // Clear preset but keep other config
      onConfigChange({
        ...config,
        preset: {},
      })
      return
    }

    setSelectedPresetKey(categoryKey)
    try {
      const preset = await getPreset(storeId, categoryKey)
      // Apply preset to config
      onConfigChange({
        ...config,
        preset: {
          product_type: preset.product_type,
          fit: preset.fit,
          use: preset.use,
          seo_keywords: preset.seo_keywords,
        },
      })
    } catch (error) {
      console.error("Failed to load preset:", error)
    }
  }

  const handleResetPreset = () => {
    if (selectedPresetKey) {
      handlePresetSelect(selectedPresetKey) // Reload preset
    }
  }

  const updatePreset = (field: string, value: string | string[]) => {
    onConfigChange({
      ...config,
      preset: {
        ...config.preset,
        [field]: value,
      },
    })
  }

  const updateAnchorKeywords = (value: string) => {
    onConfigChange({
      ...config,
      anchors: {
        ...(config.anchors || {}),
        keywords: value,
      },
    })
  }

  const updateAnchorOption = (field: string, value: boolean) => {
    onConfigChange({
      ...config,
      anchor_options: {
        ...config.anchor_options,
        [field]: value,
      },
    })
  }

  const updateTemplate = (value: string) => {
    onConfigChange({
      ...config,
      template: value,
    })
  }

  const handleResetTemplate = () => {
    // Remove template to use default
    const { template, ...restConfig } = config
    onConfigChange(restConfig)
  }

  // Use default template if config.template is not set or empty
  // If user explicitly set template to empty string, still show default for editing
  const templateValue = (config.template && config.template.trim() !== "") 
    ? config.template 
    : (defaultTemplate || "")

  const keywordsValue =
    typeof config.anchors?.keywords === "string"
      ? config.anchors.keywords
      : Array.isArray(config.anchors?.keywords)
        ? config.anchors.keywords.join("\n")
        : ""

  // Handle SEO keywords: allow multi-line input, convert to array when needed
  const seoKeywordsValue =
    typeof config.preset?.seo_keywords === "string"
      ? config.preset.seo_keywords
      : Array.isArray(config.preset?.seo_keywords)
        ? config.preset.seo_keywords.join("\n")
        : ""

  const handleSeoKeywordsChange = (value: string) => {
    // Store raw text value (allows empty lines for editing)
    // Only convert to array when actually needed (on generate/preview)
    // For now, store as string to preserve line breaks
    updatePreset("seo_keywords", value)
  }

  const handleAnchorKeywordsChange = (value: string) => {
    // Store raw text value (allows empty lines for editing)
    // Will be converted to array when sending to backend
    updateAnchorKeywords(value)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("descBuilder.configure.title")}</CardTitle>
        <CardDescription>{t("descBuilder.configure.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Preset Selection */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">{t("descBuilder.configure.preset.title")}</h3>
            {selectedPresetKey && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetPreset}
              >
                {t("descBuilder.configure.preset.reset")}
              </Button>
            )}
          </div>

          {presetsLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <div className="space-y-2">
              <Label htmlFor="preset_select">{t("descBuilder.configure.preset.selectLabel")}</Label>
              <Select
                value={selectedPresetKey || "none"}
                onValueChange={handlePresetSelect}
              >
                <SelectTrigger id="preset_select">
                  <SelectValue placeholder={t("descBuilder.configure.preset.placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("descBuilder.configure.preset.none")}</SelectItem>
                  {presets.map((preset) => (
                    <SelectItem key={preset.category_key} value={preset.category_key}>
                      {preset.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Preset Fields */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">{t("descBuilder.configure.presetFields.title")}</h3>
          
          <div className="space-y-2">
            <Label htmlFor="product_type">{t("descBuilder.configure.presetFields.productType")}</Label>
            <Input
              id="product_type"
              value={config.preset?.product_type || ""}
              onChange={(e) => updatePreset("product_type", e.target.value)}
              placeholder={t("descBuilder.configure.presetFields.productTypePlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fit">{t("descBuilder.configure.presetFields.fit")}</Label>
            <Input
              id="fit"
              value={config.preset?.fit || ""}
              onChange={(e) => updatePreset("fit", e.target.value)}
              placeholder={t("descBuilder.configure.presetFields.fitPlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="use">{t("descBuilder.configure.presetFields.use")}</Label>
            <Input
              id="use"
              value={config.preset?.use || ""}
              onChange={(e) => updatePreset("use", e.target.value)}
              placeholder={t("descBuilder.configure.presetFields.usePlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="seo_keywords">{t("descBuilder.configure.presetFields.seoKeywords")}</Label>
            <Textarea
              id="seo_keywords"
              value={seoKeywordsValue}
              onChange={(e) => handleSeoKeywordsChange(e.target.value)}
              placeholder={t("descBuilder.configure.presetFields.seoKeywordsPlaceholder")}
              rows={4}
              className="resize-y"
            />
          </div>
        </div>

        {/* Template */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="template">{t("descBuilder.configure.template.label")}</Label>
            {defaultTemplate && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetTemplate}
                disabled={!defaultTemplate}
              >
                {t("descBuilder.configure.template.reset")}
              </Button>
            )}
          </div>
          <Textarea
            id="template"
            value={templateValue}
            onChange={(e) => updateTemplate(e.target.value)}
            placeholder={t("descBuilder.configure.template.placeholder")}
            rows={15}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            {t("descBuilder.configure.template.help")}
          </p>
        </div>

        {/* Anchors */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">{t("descBuilder.configure.anchors.title")}</h3>
          
          <div className="space-y-2">
            <Label htmlFor="anchor_keywords">{t("descBuilder.configure.anchors.keywordsLabel")}</Label>
            <Textarea
              id="anchor_keywords"
              value={keywordsValue}
              onChange={(e) => handleAnchorKeywordsChange(e.target.value)}
              placeholder={t("descBuilder.configure.anchors.keywordsPlaceholder")}
              rows={4}
              className="resize-y"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.anchor_options?.append_to_keywords ?? true}
                onChange={(e) => updateAnchorOption("append_to_keywords", e.target.checked)}
                className="rounded border-input"
              />
              <span>{t("descBuilder.configure.anchors.appendToKeywords")}</span>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.anchor_options?.append_as_bullet ?? false}
                onChange={(e) => updateAnchorOption("append_as_bullet", e.target.checked)}
                className="rounded border-input"
              />
              <span>{t("descBuilder.configure.anchors.appendAsBullet")}</span>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.anchor_options?.append_at_end ?? false}
                onChange={(e) => updateAnchorOption("append_at_end", e.target.checked)}
                className="rounded border-input"
              />
              <span>{t("descBuilder.configure.anchors.appendAtEnd")}</span>
            </label>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

