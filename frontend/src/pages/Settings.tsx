import { useTranslation } from "react-i18next"
import { PageHeader } from "../components/app/PageHeader"
import { StoreManager } from "../components/StoreManager"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { useStore } from "../state/storeContext"

const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://127.0.0.1:8000'
const USE_PROXY = !API_BASE || (import.meta as any).env?.DEV

export function Settings() {
  const { t } = useTranslation()
  const { stores, selectedStoreId } = useStore()
  const selectedStore = stores.find((s) => s.id === selectedStoreId)

  return (
    <div>
      <PageHeader title={t("pages.settings.title")} />

      <div className="space-y-6">
        {/* Store Manager - Quản lý cấu hình stores */}
        <StoreManager onStoreChange={() => {
          // Reload stores when store changes
          window.location.reload();
        }} />

        <Card>
          <CardHeader>
            <CardTitle>{t("pages.settings.apiConfig")}</CardTitle>
            <CardDescription>
              API endpoint configuration (read-only)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div>
                <strong>Base URL:</strong> {USE_PROXY ? "Via Proxy" : API_BASE}
              </div>
              <div className="text-sm text-muted-foreground">
                Configured via environment variable VITE_API_BASE
              </div>
            </div>
          </CardContent>
        </Card>

        {selectedStore && (
          <Card>
            <CardHeader>
              <CardTitle>{t("pages.settings.storeConfig")}</CardTitle>
              <CardDescription>
                Current store configuration (no secrets displayed)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div>
                  <strong>Name:</strong> {selectedStore.name}
                </div>
                <div>
                  <strong>URL:</strong> {selectedStore.store_url}
                </div>
                <div>
                  <strong>WooCommerce Keys:</strong>{" "}
                  {selectedStore.has_wc_keys ? "✓ Configured" : "✗ Not configured"}
                </div>
                <div>
                  <strong>WordPress Credentials:</strong>{" "}
                  {selectedStore.has_wp_creds ? "✓ Configured" : "✗ Not configured"}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

