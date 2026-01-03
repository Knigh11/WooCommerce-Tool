import { zodResolver } from "@hookform/resolvers/zod"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import * as z from "zod"
import { PriceUpdateRequest } from "../api/types"
import { PageHeader } from "../components/app/PageHeader"
import { CategorySelector } from "../components/CategorySelector"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select"
import { useCreatePriceUpdateJob } from "../hooks/useJobs"
import { useJobManager } from "../state/jobManager"
import { useStore } from "../state/storeContext"

const priceUpdateSchema = z.object({
  categoryId: z.number().nullable(),
  adjustmentType: z.enum(["increase", "decrease"]),
  adjustmentMode: z.enum(["percent", "amount"]),
  adjustmentValue: z.number().positive(),
  batchSize: z.number().int().positive().default(30),
  maxRetries: z.number().int().positive().default(4),
  delayBetweenBatches: z.number().nonnegative().default(0.2),
})

type PriceUpdateFormData = z.infer<typeof priceUpdateSchema>

export function UpdatePrices() {
  const { t } = useTranslation()
  const { selectedStoreId } = useStore()
  const { addJob, openDrawer } = useJobManager()
  const createJob = useCreatePriceUpdateJob()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<PriceUpdateFormData>({
    resolver: zodResolver(priceUpdateSchema),
    defaultValues: {
      categoryId: null,
      adjustmentType: "increase",
      adjustmentMode: "percent",
      adjustmentValue: 10,
      batchSize: 30,
      maxRetries: 4,
      delayBetweenBatches: 0.2,
    },
  })

  const selectedCategoryId = watch("categoryId")
  const adjustmentType = watch("adjustmentType")
  const adjustmentMode = watch("adjustmentMode")
  const adjustmentValue = watch("adjustmentValue")

  // Đảm bảo adjustmentMode luôn có giá trị hợp lệ
  useEffect(() => {
    if (!adjustmentMode || (adjustmentMode !== "percent" && adjustmentMode !== "amount")) {
      setValue("adjustmentMode", "percent", { shouldValidate: false })
    }
  }, [adjustmentMode, setValue])

  const onSubmit = async (data: PriceUpdateFormData) => {
    if (!selectedStoreId) {
      toast.error(t("errors.selectStore"))
      return
    }

    try {
      const request: PriceUpdateRequest = {
        category_id: data.categoryId,
        adjustment_type: data.adjustmentType,
        adjustment_mode: data.adjustmentMode,
        adjustment_value: data.adjustmentValue,
        options: {
          batch_size: data.batchSize,
          max_retries: data.maxRetries,
          delay_between_batches: data.delayBetweenBatches,
        },
      }

      const result = await createJob.mutateAsync({
        storeId: selectedStoreId,
        request,
      })

      addJob(result.job_id, selectedStoreId, result.job_token)
      openDrawer()
      toast.success(t("job.created") + ": " + result.job_id.substring(0, 8))
    } catch (err: any) {
      toast.error(err.message || t("errors.unknownError"))
    }
  }

  const categoryName =
    selectedCategoryId === null
      ? t("forms.category.allCategories")
      : `Category ID ${selectedCategoryId}`

  const adjustmentText = `${adjustmentType === "increase" ? t("forms.adjustmentType.increase") : t("forms.adjustmentType.decrease")} ${adjustmentValue}${adjustmentMode === "percent" ? "%" : ""}`

  return (
    <div>
      <PageHeader title={t("pages.updatePrices.title")} />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Scope Card */}
        <Card>
          <CardHeader>
            <CardTitle>{t("pages.updatePrices.scope")}</CardTitle>
            <CardDescription>
              {t("forms.category.label")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CategorySelector
              storeId={selectedStoreId}
              selectedCategoryId={selectedCategoryId}
              onSelect={(id) => {
                setValue("categoryId", id, { shouldValidate: true })
              }}
              showAllOption={true}
              height={10}
            />
            {errors.categoryId && (
              <p className="text-sm text-destructive mt-2">
                {errors.categoryId.message}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Rule Card */}
        <Card>
          <CardHeader>
            <CardTitle>{t("pages.updatePrices.rule")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>{t("forms.adjustmentType.label")}</Label>
                <Select
                  value={adjustmentType}
                  onValueChange={(value) => {
                    setValue("adjustmentType", value as "increase" | "decrease", {
                      shouldValidate: true,
                    })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="increase">
                      {t("forms.adjustmentType.increase")}
                    </SelectItem>
                    <SelectItem value="decrease">
                      {t("forms.adjustmentType.decrease")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("forms.adjustmentMode.label")}</Label>
                <Select
                  value={adjustmentMode}
                  onValueChange={(value) => {
                    setValue("adjustmentMode", value as "percent" | "amount", {
                      shouldValidate: true,
                    })
                    trigger("adjustmentMode")
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">
                      {t("forms.adjustmentMode.percent")}
                    </SelectItem>
                    <SelectItem value="amount">
                      {t("forms.adjustmentMode.fixed")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("forms.adjustmentValue.label")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...register("adjustmentValue", { valueAsNumber: true })}
                />
                {errors.adjustmentValue && (
                  <p className="text-sm text-destructive mt-1">
                    {errors.adjustmentValue.message}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Options Card */}
        <Card>
          <CardHeader>
            <CardTitle>{t("pages.updatePrices.options")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>{t("forms.batchSize.label")}</Label>
                <Input
                  type="number"
                  {...register("batchSize", { valueAsNumber: true })}
                />
                {errors.batchSize && (
                  <p className="text-sm text-destructive mt-1">
                    {errors.batchSize.message}
                  </p>
                )}
              </div>
              <div>
                <Label>{t("forms.maxRetries.label")}</Label>
                <Input
                  type="number"
                  {...register("maxRetries", { valueAsNumber: true })}
                />
                {errors.maxRetries && (
                  <p className="text-sm text-destructive mt-1">
                    {errors.maxRetries.message}
                  </p>
                )}
              </div>
              <div>
                <Label>{t("forms.delayBetweenBatches.label")}</Label>
                <Input
                  type="number"
                  step="0.1"
                  {...register("delayBetweenBatches", { valueAsNumber: true })}
                />
                {errors.delayBetweenBatches && (
                  <p className="text-sm text-destructive mt-1">
                    {errors.delayBetweenBatches.message}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Review Card */}
        <Card>
          <CardHeader>
            <CardTitle>{t("pages.updatePrices.review")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div>
                <strong>{t("pages.updatePrices.scope")}:</strong> {categoryName}
              </div>
              <div>
                <strong>{t("pages.updatePrices.rule")}:</strong> {adjustmentText}
              </div>
            </div>
          </CardContent>
        </Card>

        <Button
          type="button"
          disabled={!selectedStoreId || isSubmitting}
          className="w-full"
          onClick={(e) => {
            e.preventDefault()
            // Debug: log giá trị hiện tại trước khi validate
            const currentValues = watch()
            console.log("Current form values before submit:", currentValues)
            console.log("adjustmentMode:", currentValues.adjustmentMode, "type:", typeof currentValues.adjustmentMode)

            const submitHandler = handleSubmit(
              (data) => {
                console.log("Form data validated successfully:", data)
                onSubmit(data)
              },
              (errors) => {
                console.error("Validation errors:", errors)
                console.error("adjustmentMode error:", errors.adjustmentMode)
                // Hiển thị chi tiết lỗi validation
                const errorMessages = Object.entries(errors).map(([field, error]) => {
                  return `${field}: ${error?.message || "Invalid"}`
                })
                toast.error(
                  t("errors.validationFailed") + ": " + errorMessages.join(", ")
                )
              }
            )
            submitHandler()
          }}
        >
          {isSubmitting ? t("common.loading") : t("common.createJob")}
        </Button>
      </form>
    </div>
  )
}

