import { lazy, Suspense } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { AppShell } from "./components/app/AppShell"
import { LoadingState } from "./components/common/LoadingState"

// Lazy load all pages for code splitting
const Dashboard = lazy(() => import("./pages/Dashboard").then(m => ({ default: m.Dashboard })))
const SingleProduct = lazy(() => import("./pages/SingleProduct").then(m => ({ default: m.SingleProduct })))
const UpdatePrices = lazy(() => import("./pages/UpdatePrices").then(m => ({ default: m.UpdatePrices })))
const BulkFields = lazy(() => import("./pages/BulkFields").then(m => ({ default: m.BulkFields })))
const DeleteProducts = lazy(() => import("./pages/DeleteProducts").then(m => ({ default: m.DeleteProducts })))
const ImportCSV = lazy(() => import("./pages/ImportCSV").then(m => ({ default: m.ImportCSV })))
const Categories = lazy(() => import("./pages/Categories").then(m => ({ default: m.Categories })))
const Reviews = lazy(() => import("./pages/Reviews").then(m => ({ default: m.Reviews })))
const Jobs = lazy(() => import("./pages/Jobs").then(m => ({ default: m.Jobs })))
const Settings = lazy(() => import("./pages/Settings").then(m => ({ default: m.Settings })))
const UpsellCombosV2 = lazy(() => import("./pages/UpsellCombosV2").then(m => ({ default: m.UpsellCombosV2 })))
const BMSMRulesV2 = lazy(() => import("./pages/BMSMRulesV2").then(m => ({ default: m.BMSMRulesV2 })))
const DescriptionBuilderPage = lazy(() => import("./pages/DescriptionBuilderPage").then(m => ({ default: m.DescriptionBuilderPage })))
const Feeds = lazy(() => import("./pages/Feeds").then(m => ({ default: m.Feeds })))
const CsvGenerator = lazy(() => import("./pages/CsvGenerator").then(m => ({ default: m.CsvGenerator })))

// Helper wrapper to avoid repeating Suspense boilerplate
const withSuspense = (element: React.ReactElement) => (
  <Suspense fallback={<LoadingState />}>{element}</Suspense>
)

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={withSuspense(<Dashboard />)} />
          <Route path="single" element={withSuspense(<SingleProduct />)} />
          <Route path="update-prices" element={withSuspense(<UpdatePrices />)} />
          <Route path="bulk-fields" element={withSuspense(<BulkFields />)} />
          <Route path="delete" element={withSuspense(<DeleteProducts />)} />
          <Route path="import-csv" element={withSuspense(<ImportCSV />)} />
          <Route path="categories" element={withSuspense(<Categories />)} />
          <Route path="reviews" element={withSuspense(<Reviews />)} />
          <Route path="jobs" element={withSuspense(<Jobs />)} />
          <Route path="settings" element={withSuspense(<Settings />)} />
          <Route path="offers/fbt" element={withSuspense(<UpsellCombosV2 />)} />
          <Route path="offers/bmsm" element={withSuspense(<BMSMRulesV2 />)} />
          <Route path="offers/upsell-combos-v2" element={withSuspense(<UpsellCombosV2 />)} />
          <Route path="offers/bmsm-rules-v2" element={withSuspense(<BMSMRulesV2 />)} />
          <Route path="stores/:storeId/description-builder" element={withSuspense(<DescriptionBuilderPage />)} />
          <Route path="feeds" element={withSuspense(<Feeds />)} />
          <Route path="csv-generator" element={withSuspense(<CsvGenerator />)} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
