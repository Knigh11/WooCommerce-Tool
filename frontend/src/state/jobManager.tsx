import { createContext, useContext, useState, ReactNode, useCallback } from "react"
import {
  JobProgress,
  JobMetrics,
  JobCurrent,
  SSELogEvent,
} from "../api/types"

export interface JobState {
  jobId: string
  storeId: string
  jobToken?: string // Job token for SSE and download access
  status: "queued" | "running" | "done" | "failed" | "cancelled"
  progress?: JobProgress
  metrics?: JobMetrics
  current?: JobCurrent
  logs: SSELogEvent[]
  sseConnected: boolean
  startedAt?: string
  updatedAt?: string
}

interface JobManagerContextType {
  jobs: Map<string, JobState>
  addJob: (jobId: string, storeId: string, jobToken?: string) => void
  removeJob: (jobId: string) => void
  updateJob: (jobId: string, updates: Partial<JobState>) => void
  getJob: (jobId: string) => JobState | undefined
  isDrawerOpen: boolean
  openDrawer: () => void
  closeDrawer: () => void
  toggleDrawer: () => void
  activeJobIds: string[]
  // JobModal support
  modalJobId: string | null
  openModal: (jobId: string) => void
  closeModal: () => void
}

const JobManagerContext = createContext<JobManagerContextType | undefined>(
  undefined
)

const MAX_JOBS = 20

export function JobProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Map<string, JobState>>(new Map())
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [modalJobId, setModalJobId] = useState<string | null>(null)

  const addJob = useCallback((jobId: string, storeId: string, jobToken?: string) => {
    setJobs((prev) => {
      const next = new Map(prev)
      
      // If we're at max capacity, remove oldest completed job
      if (next.size >= MAX_JOBS) {
        const completedJobs = Array.from(next.entries())
          .filter(([_, job]) => 
            ["done", "failed", "cancelled"].includes(job.status)
          )
          .sort((a, b) => {
            const aTime = a[1].updatedAt || a[1].startedAt || ""
            const bTime = b[1].updatedAt || b[1].startedAt || ""
            return aTime.localeCompare(bTime)
          })
        
        if (completedJobs.length > 0) {
          next.delete(completedJobs[0][0])
        } else {
          // If no completed jobs, remove oldest
          const oldest = Array.from(next.entries())
            .sort((a, b) => {
              const aTime = a[1].startedAt || ""
              const bTime = b[1].startedAt || ""
              return aTime.localeCompare(bTime)
            })[0]
          if (oldest) next.delete(oldest[0])
        }
      }

      next.set(jobId, {
        jobId,
        storeId,
        jobToken,
        status: "queued",
        logs: [],
        sseConnected: false,
        startedAt: new Date().toISOString(),
      })
      return next
    })
  }, [])

  const removeJob = useCallback((jobId: string) => {
    setJobs((prev) => {
      const next = new Map(prev)
      next.delete(jobId)
      return next
    })
  }, [])

  const updateJob = useCallback((jobId: string, updates: Partial<JobState>) => {
    setJobs((prev) => {
      const next = new Map(prev)
      const existing = next.get(jobId)
      if (existing) {
        next.set(jobId, {
          ...existing,
          ...updates,
          updatedAt: new Date().toISOString(),
        })
      }
      return next
    })
  }, [])

  const getJob = useCallback(
    (jobId: string) => {
      return jobs.get(jobId)
    },
    [jobs]
  )

  const openDrawer = useCallback(() => {
    setIsDrawerOpen(true)
  }, [])

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false)
  }, [])

  const toggleDrawer = useCallback(() => {
    setIsDrawerOpen((prev) => !prev)
  }, [])

  const openModal = useCallback((jobId: string) => {
    setModalJobId(jobId)
  }, [])

  const closeModal = useCallback(() => {
    setModalJobId(null)
  }, [])

  // Only include jobs that are not in terminal state
  const activeJobIds = Array.from(jobs.entries())
    .filter(([_, job]) => !["done", "failed", "cancelled"].includes(job.status))
    .map(([jobId]) => jobId)

  return (
    <JobManagerContext.Provider
      value={{
        jobs,
        addJob,
        removeJob,
        updateJob,
        getJob,
        isDrawerOpen,
        openDrawer,
        closeDrawer,
        toggleDrawer,
        activeJobIds,
        modalJobId,
        openModal,
        closeModal,
      }}
    >
      {children}
    </JobManagerContext.Provider>
  )
}

export function useJobManager() {
  const context = useContext(JobManagerContext)
  if (context === undefined) {
    throw new Error("useJobManager must be used within a JobProvider")
  }
  return context
}

