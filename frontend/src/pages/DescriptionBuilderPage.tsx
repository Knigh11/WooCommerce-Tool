// Description Builder Page

import { useMutation, useQuery, useQuery as useStoreDetailQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { apiFetch } from "../api/client"
import { downloadUrl, generate, jobEventsUrl, preview, uploadZip } from "../api/descriptionBuilder"
import { endpoints } from "../api/endpoints"
import { StoreDetail } from "../api/types"
import { DescConfigPanel } from "../components/DescConfigPanel"
import { LeafItemsPanel } from "../components/LeafItemsPanel"
import { PreviewGeneratePanel } from "../components/PreviewGeneratePanel"
import { ZipUploadCard } from "../components/ZipUploadCard"
import { PageHeader } from "../components/app/PageHeader"
import { useSseJob } from "../hooks/useSseJob"
import {
  Config,
  GenerateRequest,
  LeafItem,
  PreviewRequest,
  UploadResponse,
} from "../utils/descriptionBuilderSchemas"
import { updateStoreApiKeyFromProfile } from "../utils/storeKey"

type Step = 1 | 2 | 3 | 4
type JobStatus = "idle" | "running" | "done" | "error"

// Debug flag - set to true for development debugging
const DEBUG = process.env.NODE_ENV === "development" && false

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

export function DescriptionBuilderPage() {
  const { t } = useTranslation()
  const { storeId } = useParams<{ storeId: string }>()

  // Load store API key when storeId from URL changes
  // This endpoint doesn't require X-Store-Key, so we can load it without the key
  const { data: storeDetail } = useStoreDetailQuery({
    queryKey: ["storeDetail", storeId],
    queryFn: async () => {
      if (!storeId) return null

      try {
        // Store endpoint doesn't require X-Store-Key, so we can load without it
        const { data } = await apiFetch<StoreDetail>(
          endpoints.store(storeId)
          // Don't pass storeId here to avoid trying to send X-Store-Key header
        )

        // Update API key cache if available
        if (data?.api_key) {
          updateStoreApiKeyFromProfile(storeId, data)
        } else {
          // If no API key, show warning in console (but don't block)
          console.warn(`Store ${storeId} does not have an API key configured. Please add one in store settings.`)
        }

        return data
      } catch (error) {
        console.warn(`Failed to load store detail for ${storeId}:`, error)
        return null
      }
    },
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })

  // Show warning if store doesn't have API key
  useEffect(() => {
    if (storeDetail && !storeDetail.api_key) {
      console.warn(`Store "${storeDetail.name}" (${storeId}) does not have an API key. Please configure it in store settings.`)
    }
  }, [storeDetail, storeId])

  // Step state
  const [step, setStep] = useState<Step>(1)

  // Upload session state
  const [uploadSession, setUploadSession] = useState<{
    uploadId: string
    uploadToken: string
    rootName: string | null
    multipleRoots: boolean
    zipSize: number
    items: LeafItem[]
    summary: { leaf_count: number; with_description: number }
  } | null>(null)

  // Selection + Filters
  const [selectedRelPaths, setSelectedRelPaths] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<string>("ALL")
  const [showOnlyMissingDesc, setShowOnlyMissingDesc] = useState(false)

  // Config
  const [config, setConfig] = useState<Config>({})
  const [overwrite, setOverwrite] = useState(true)

  // Preview
  const [previewTargetRelPath, setPreviewTargetRelPath] = useState<string | null>(null)

  // Job state
  const [job, setJob] = useState<{
    jobId: string
    jobToken: string
    status: JobStatus
    done: number
    total: number
    logs: string[]
    errors: Record<string, string>
  } | null>(null)

  // Upload progress state
  const [uploadProgress, setUploadProgress] = useState(0)

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!storeId) {
        throw new Error("Store ID is required")
      }

      // Check if store detail is loaded and has API key
      if (!storeDetail) {
        // Try to wait a bit for store detail to load
        await new Promise(resolve => setTimeout(resolve, 500))
        // Re-check after waiting
        const { getStoreApiKey } = await import("../utils/storeKey")
        const storeKey = getStoreApiKey(storeId)
        if (!storeKey) {
          throw new Error(
            `Store API key not found. ` +
            "Please configure the API key in store settings (Settings > Stores). " +
            "If the store doesn't have an API key, you can generate one in the store settings."
          )
        }
      } else if (!storeDetail.api_key) {
        throw new Error(
          `Store "${storeDetail.name}" does not have an API key configured. ` +
          "Please add or generate an API key in store settings (Settings > Stores)."
        )
      }

      return uploadZip(storeId, file, (pct) => setUploadProgress(pct))
    },
    onSuccess: (data: UploadResponse) => {
      setUploadSession({
        uploadId: data.upload_id,
        uploadToken: data.upload_token,
        rootName: data.root_name,
        multipleRoots: data.multiple_roots,
        zipSize: data.zip_size,
        items: data.items,
        summary: {
          leaf_count: data.summary.leaf_count,
          with_description: data.summary.with_description,
        },
      })
      setUploadProgress(0)
      setStep(2)
      toast.success(t("descBuilder.upload.success", { count: data.items.length }))
    },
    onError: (error: Error) => {
      toast.error(t("descBuilder.errors.uploadFailed", { message: error.message }))
    },
  })

  // Preview query (debounced)
  const configHash = useMemo(
    () => JSON.stringify(config),
    [config]
  )
  const debouncedConfigHash = useDebounce(configHash, 300)

  // Helper to normalize config (convert string seo_keywords to array)
  const normalizeConfig = (cfg: Config): Config => {
    const normalized = { ...cfg }
    if (normalized.preset?.seo_keywords) {
      if (typeof normalized.preset.seo_keywords === "string") {
        normalized.preset.seo_keywords = normalized.preset.seo_keywords
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
      }
    }
    if (normalized.anchors?.keywords) {
      if (typeof normalized.anchors.keywords === "string") {
        normalized.anchors.keywords = normalized.anchors.keywords
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
      }
    }
    // If template is empty string, remove it (use default on backend)
    if (normalized.template === "") {
      delete normalized.template
    }
    return normalized
  }

  const previewQuery = useQuery({
    queryKey: ["descPreview", storeId, uploadSession?.uploadId, previewTargetRelPath, debouncedConfigHash],
    queryFn: async () => {
      if (!uploadSession || !previewTargetRelPath) return null
      const payload: PreviewRequest = {
        upload_id: uploadSession.uploadId,
        upload_token: uploadSession.uploadToken,
        rel_path: previewTargetRelPath,
        config: normalizeConfig(config),
      }
      return preview(storeId!, payload)
    },
    enabled: !!uploadSession && !!previewTargetRelPath && step >= 3,
    retry: 1,
  })

  // Auto-select first item for preview when step changes to 3
  useEffect(() => {
    if (step === 3 && selectedRelPaths.size > 0 && !previewTargetRelPath) {
      const firstSelected = Array.from(selectedRelPaths)[0]
      setPreviewTargetRelPath(firstSelected)
    }
  }, [step, selectedRelPaths, previewTargetRelPath])

  // Auto-refresh preview when config changes (debounced)
  useEffect(() => {
    if (step >= 3 && previewTargetRelPath && debouncedConfigHash) {
      previewQuery.refetch()
    }
  }, [debouncedConfigHash, step, previewTargetRelPath])

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!uploadSession) throw new Error(t("descBuilder.errors.noUploadSession"))
      const payload: GenerateRequest = {
        upload_id: uploadSession.uploadId,
        upload_token: uploadSession.uploadToken,
        rel_paths: Array.from(selectedRelPaths),
        config: normalizeConfig(config),
        overwrite,
      }
      return generate(storeId!, payload)
    },
    onSuccess: (data) => {
      setJob({
        jobId: data.job_id,
        jobToken: data.job_token,
        status: "running",
        done: 0,
        total: selectedRelPaths.size,
        logs: [],
        errors: {},
      })
      setStep(4)
      toast.success(t("descBuilder.generate.started"))
    },
    onError: (error: Error) => {
      toast.error(t("descBuilder.errors.generationFailed", { message: error.message }))
    },
  })

  // Poll job status if job is running (fallback if SSE misses "done" event)
  useEffect(() => {
    if (!job || job.status !== "running" || !storeId) return

    const pollInterval = setInterval(async () => {
      try {
        // Check if job is done by checking if patch_zip_path exists
        // We can't directly check job status without an endpoint, so we'll rely on SSE
        // But we can add a timeout: if job has been running for too long and we see "Created ZIP patch" log,
        // assume it's done
        const hasZipPatchLog = job.logs.some(log => log.includes("Created ZIP patch"))
        if (hasZipPatchLog && job.done >= job.total && job.total > 0) {
          // Job appears complete but status not updated - update it
          setJob((prev) => {
            if (!prev || prev.status !== "running") return prev
            if (DEBUG) console.log("[Job Status Update] Setting status to done from polling (ZIP patch log found)")
            return { ...prev, status: "done" }
          })
        }
      } catch (error) {
        console.error("Error polling job status:", error)
      }
    }, 2000) // Poll every 2 seconds

    return () => clearInterval(pollInterval)
  }, [job, storeId])

  // SSE for job events
  const sseUrl = job ? jobEventsUrl(storeId!, job.jobId, job.jobToken) : null
  useSseJob({
    url: sseUrl,
    enabled: !!job && (job.status === "running" || job.status === "idle"),
    onEvent: (event) => {
      if (!job) return

      try {
        // SSE events come with event.type and event.data
        const eventType = event.type || "message"
        let dataStr = event.data

        // Debug logging
        if (DEBUG) {
          console.log("[SSE Event]", eventType, dataStr)
        }

        if (eventType === "status") {
          const data = JSON.parse(dataStr)
          if (data.status === "done") {
            setJob((prev) => {
              if (!prev) return null
              if (DEBUG) console.log("[Job Status Update] Setting status to done")
              return { ...prev, status: "done" }
            })
            toast.success(t("descBuilder.generate.completed"))
          } else if (data.status === "failed") {
            setJob((prev) => (prev ? { ...prev, status: "error" } : null))
            toast.error(t("descBuilder.generate.failed"))
          } else if (data.status === "running") {
            setJob((prev) => (prev ? { ...prev, status: "running" } : null))
          }
        } else if (eventType === "progress") {
          const data = JSON.parse(dataStr)
          setJob((prev) =>
            prev
              ? {
                ...prev,
                done: data.done || 0,
                total: data.total || prev.total,
              }
              : null
          )
        } else if (eventType === "log") {
          const data = JSON.parse(dataStr)
          const logMsg = data.msg || String(data)
          setJob((prev) => {
            if (!prev) return null
            const newLogs = [...prev.logs.slice(-199), logMsg].slice(-200)

            // If we see "Created ZIP patch" log and job is running, mark as done
            // This is a fallback in case the "status" event with "done" is missed due to SSE reconnect
            if (logMsg.includes("Created ZIP patch") && prev.status === "running") {
              if (DEBUG) console.log("[Job Status Update] Setting status to done from log event (ZIP patch created)")
              return { ...prev, status: "done", logs: newLogs }
            }

            return { ...prev, logs: newLogs }
          })
        } else if (eventType === "error") {
          const data = JSON.parse(dataStr)
          setJob((prev) =>
            prev
              ? {
                ...prev,
                status: "error",
                errors: { ...prev.errors, [data.rel_path || "unknown"]: data.message || String(data) },
              }
              : null
          )
        } else if (eventType === "snapshot") {
          // Handle snapshot event (sent on SSE connect)
          try {
            const data = JSON.parse(dataStr)
            if (data.status === "done") {
              setJob((prev) => {
                if (!prev) return null
                if (DEBUG) console.log("[Job Status Update] Setting status to done from snapshot")
                return { ...prev, status: "done" }
              })
            } else if (data.status === "running") {
              setJob((prev) => (prev ? { ...prev, status: "running" } : null))
            }
          } catch {
            // Ignore parse errors for snapshot events
          }
        } else if (eventType === "message" && dataStr) {
          // Handle generic message events
          try {
            const data = JSON.parse(dataStr)
            if (data.msg) {
              setJob((prev) =>
                prev
                  ? {
                    ...prev,
                    logs: [...prev.logs.slice(-199), data.msg].slice(-200),
                  }
                  : null
              )
            }
            // Also check if message contains status info
            if (data.status === "done") {
              setJob((prev) => {
                if (!prev) return null
                if (DEBUG) console.log("[Job Status Update] Setting status to done from message")
                return { ...prev, status: "done" }
              })
            }
          } catch {
            // Ignore parse errors for message events
          }
        }
      } catch (err) {
        console.error("Error parsing SSE event:", err)
      }
    },
    onError: (error) => {
      console.error("SSE error:", error)
      const eventSource = (error.target as EventSource)
      if (eventSource?.readyState === EventSource.CLOSED) {
        toast.error(t("settings.storeManager.apiKey.expired"))
      }
    },
  })

  // Handlers
  const handleFileSelect = (file: File) => {
    uploadMutation.mutate(file)
  }

  const handleToggleSelection = (relPath: string) => {
    setSelectedRelPaths((prev) => {
      const next = new Set(prev)
      if (next.has(relPath)) {
        next.delete(relPath)
      } else {
        next.add(relPath)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    if (!uploadSession) return
    const allPaths = new Set(uploadSession.items.map((item) => item.rel_path))
    setSelectedRelPaths(allPaths)
  }

  const handleDeselectAll = () => {
    setSelectedRelPaths(new Set())
  }

  const handlePreview = () => {
    if (selectedRelPaths.size > 0) {
      const firstSelected = Array.from(selectedRelPaths)[0]
      setPreviewTargetRelPath(firstSelected)
      previewQuery.refetch()
    }
  }

  const handleGenerate = () => {
    if (selectedRelPaths.size === 0) {
      toast.error(t("descBuilder.errors.selectFolder"))
      return
    }
    generateMutation.mutate()
  }

  const handleDownload = () => {
    if (!job) return
    const url = downloadUrl(storeId!, job.jobId, job.jobToken)
    window.open(url, "_blank")
  }

  // Step navigation
  useEffect(() => {
    if (uploadSession && step === 1) {
      setStep(2)
    }
  }, [uploadSession, step])

  if (!storeId) {
    return <div>{t("descBuilder.errors.storeIdRequired")}</div>
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title={t("descBuilder.title")}
        description={t("descBuilder.description")}
      />

      {/* Step Indicator */}
      <div className="flex items-center gap-4 border-b pb-4">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`flex items-center gap-2 ${step >= s ? "text-primary" : "text-muted-foreground"
              }`}
          >
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${step >= s
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted"
                }`}
            >
              {s}
            </div>
            <span className="text-sm font-medium">
              {s === 1 && t("descBuilder.steps.upload")}
              {s === 2 && t("descBuilder.steps.select")}
              {s === 3 && t("descBuilder.steps.configure")}
              {s === 4 && t("descBuilder.steps.generate")}
            </span>
            {s < 4 && <span className="text-muted-foreground">→</span>}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {step === 1 && (
          <div className="lg:col-span-2">
            <ZipUploadCard
              onFileSelect={handleFileSelect}
              isUploading={uploadMutation.isPending}
              uploadProgress={uploadProgress}
              isAnalyzing={uploadMutation.isPending}
              error={uploadMutation.error?.message || null}
            />
          </div>
        )}

        {step >= 2 && uploadSession && (
          <>
            <LeafItemsPanel
              items={uploadSession.items}
              selectedRelPaths={selectedRelPaths}
              onToggleSelection={handleToggleSelection}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              search={search}
              onSearchChange={setSearch}
              category={category}
              onCategoryChange={setCategory}
              showOnlyMissingDesc={showOnlyMissingDesc}
              onShowOnlyMissingDescChange={setShowOnlyMissingDesc}
              isLoading={false}
            />

            {step >= 3 && (
              <>
                <DescConfigPanel storeId={storeId || ""} config={config} onConfigChange={setConfig} />

                <div className="lg:col-span-2">
                  <PreviewGeneratePanel
                    previewText={previewQuery.data?.text || null}
                    isPreviewLoading={previewQuery.isLoading}
                    previewError={previewQuery.error?.message || null}
                    onPreview={handlePreview}
                    onGenerate={handleGenerate}
                    isGenerating={generateMutation.isPending || job?.status === "running"}
                    jobStatus={job?.status || null}
                    jobProgress={job ? { done: job.done, total: job.total } : null}
                    jobLogs={job?.logs || []}
                    onDownload={handleDownload}
                    selectedCount={selectedRelPaths.size}
                    rootName={uploadSession.rootName}
                    multipleRoots={uploadSession.multipleRoots}
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Navigation Buttons */}
      {step > 1 && (
        <div className="flex justify-between">
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1) as Step)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Previous Step
          </button>
          {step === 2 && selectedRelPaths.size > 0 && (
            <button
              onClick={() => setStep(3)}
              className="text-sm text-primary hover:underline"
            >
              Next: Configure →
            </button>
          )}
        </div>
      )}
    </div>
  )
}

