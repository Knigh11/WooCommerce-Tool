import { PageHeader } from "../components/app/PageHeader"
import { useTranslation } from "react-i18next"
import { BulkUpdateProducts } from "../components/BulkUpdateProducts"
import { useStore } from "../state/storeContext"
import { useJobManager } from "../state/jobManager"

export function BulkFields() {
  const { t } = useTranslation()
  const { selectedStoreId } = useStore()
  const { addJob, openDrawer } = useJobManager()

  return (
    <div>
      <PageHeader title={t("pages.bulkFields.title")} />
      <BulkUpdateProducts
        storeId={selectedStoreId}
        onCreateJob={(jobId) => {
          if (selectedStoreId) {
            addJob(jobId, selectedStoreId)
            openDrawer()
          }
        }}
      />
    </div>
  )
}

