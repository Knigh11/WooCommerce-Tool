import { lazy, Suspense } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
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
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
