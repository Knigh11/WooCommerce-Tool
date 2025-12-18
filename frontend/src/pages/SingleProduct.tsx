import { PageHeader } from "../components/app/PageHeader"
import { useTranslation } from "react-i18next"
import { ProductEditor } from "../components/ProductEditor"
import { useStore } from "../state/storeContext"
import { useSearchParams } from "react-router-dom"

export function SingleProduct() {
  const { t } = useTranslation()
  const { selectedStoreId } = useStore()
  const [searchParams] = useSearchParams()
  const urlParam = searchParams.get("url")
  const idParam = searchParams.get("id")

  return (
    <div>
      <PageHeader title={t("pages.single.title")} />
      <ProductEditor storeId={selectedStoreId} initialUrl={urlParam || undefined} initialId={idParam ? parseInt(idParam) : undefined} />
    </div>
  )
}

