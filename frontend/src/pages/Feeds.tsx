import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useStore } from "../state/storeContext"
import { FeedsCreator } from "../components/FeedsCreator"
import { FeedsJobsTable } from "../components/FeedsJobsTable"
import { FeedJobModal } from "../components/FeedJobModal"
import { PageHeader } from "../components/app/PageHeader"
import { EmptyState } from "../components/common/EmptyState"

// Simple in-memory store for job tokens (keyed by job_id)
const jobTokens = new Map<string, string>()

export function Feeds() {
  const { t } = useTranslation()
  const { selectedStoreId } = useStore()
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [selectedJobToken, setSelectedJobToken] = useState<string | null>(null)

  if (!selectedStoreId) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("feeds.title")} />
        <EmptyState
          title={t("errors.selectStore")}
          description={t("errors.selectStoreDescription") || "Please select a store from the top bar to continue."}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("feeds.title")} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Create Form */}
        <div>
          <FeedsCreator
            storeId={selectedStoreId}
            onJobCreated={(jobId, token) => {
              setSelectedJobId(jobId)
              if (token) {
                setSelectedJobToken(token)
                jobTokens.set(jobId, token)
              }
            }}
          />
        </div>

        {/* Right: Jobs Table */}
        <div>
          <FeedsJobsTable
            storeId={selectedStoreId}
            onViewJob={(jobId) => {
              setSelectedJobId(jobId)
              // Try to get token from cache
              const cachedToken = jobTokens.get(jobId)
              if (cachedToken) {
                setSelectedJobToken(cachedToken)
              }
            }}
          />
        </div>
      </div>

      {/* Job Modal */}
      <FeedJobModal
        storeId={selectedStoreId}
        jobId={selectedJobId}
        token={selectedJobToken || (selectedJobId ? jobTokens.get(selectedJobId) || undefined : undefined)}
        onClose={() => {
          setSelectedJobId(null)
          setSelectedJobToken(null)
        }}
      />
    </div>
  )
}

