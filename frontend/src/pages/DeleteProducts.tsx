import { PageHeader } from "../components/app/PageHeader"
import { useTranslation } from "react-i18next"
import { DeleteProducts as DeleteProductsComponent } from "../components/DeleteProducts"
import { useStore } from "../state/storeContext"
import { useJobManager } from "../state/jobManager"

export function DeleteProducts() {
  const { t } = useTranslation()
  const { selectedStoreId } = useStore()
  const { addJob, openDrawer } = useJobManager()

  return (
    <div>
      <PageHeader title={t("pages.delete.title")} />
      <DeleteProductsComponent
        storeId={selectedStoreId}
        onCreateJob={(jobId, jobToken) => {
          if (selectedStoreId) {
            addJob(jobId, selectedStoreId, jobToken)
            openDrawer()
          }
        }}
      />
    </div>
  )
}

