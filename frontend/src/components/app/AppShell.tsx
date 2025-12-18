import { lazy, Suspense } from "react"
import { Outlet, useLocation } from "react-router-dom"
import { SidebarNav } from "./SidebarNav"
import { TopBar } from "./TopBar"
import { Toaster } from "sonner"
import { useJobManager } from "../../state/jobManager"

// Lazy load JobDrawer - only load when needed
const JobDrawer = lazy(() => import("./JobDrawer").then(m => ({ default: m.JobDrawer })))

// Lazy load page transition animation to avoid pulling framer-motion into entry chunk
const AnimatedPageWrapper = lazy(() => 
  import("./AnimatedPageWrapper").then(m => ({ default: m.AnimatedPageWrapper }))
)

export function AppShell() {
  const location = useLocation()
  const { isDrawerOpen, activeJobIds } = useJobManager()
  
  // Only mount JobDrawer when drawer is open OR there are active jobs
  // This ensures the component code is only loaded when needed
  const shouldLoadJobDrawer = isDrawerOpen || activeJobIds.length > 0

  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          <Suspense fallback={null}>
            <AnimatedPageWrapper locationKey={location.pathname}>
              <Outlet />
            </AnimatedPageWrapper>
          </Suspense>
        </main>
      </div>
      {shouldLoadJobDrawer && (
        <Suspense fallback={null}>
          <JobDrawer />
        </Suspense>
      )}
      <Toaster position="top-right" />
    </div>
  )
}

