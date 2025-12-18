import { PageHeader } from "../components/app/PageHeader"
import { useTranslation } from "react-i18next"
import { CategoryManager } from "../components/CategoryManager"
import { useStore } from "../state/storeContext"

export function Categories() {
  const { t } = useTranslation()
  const { selectedStoreId } = useStore()

  return (
    <div>
      <PageHeader title={t("pages.categories.title")} />
      <CategoryManager storeId={selectedStoreId} />
    </div>
  )
}

