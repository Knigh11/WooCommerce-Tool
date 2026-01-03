import { createContext, useContext, useState, ReactNode, useEffect } from "react"
import { StoreSummary } from "../api/types"

const STORE_ID_STORAGE_KEY = "woocommerce_selected_store_id"

interface StoreContextType {
  selectedStoreId: string | null
  setSelectedStoreId: (id: string | null) => void
  stores: StoreSummary[]
  setStores: (stores: StoreSummary[]) => void
}

const StoreContext = createContext<StoreContextType | undefined>(undefined)

export function StoreProvider({ children }: { children: ReactNode }) {
  // Load persisted store ID from localStorage
  const [selectedStoreId, setSelectedStoreIdState] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(STORE_ID_STORAGE_KEY)
      return stored || null
    } catch {
      return null
    }
  })
  const [stores, setStores] = useState<StoreSummary[]>([])

  // Persist store ID to localStorage when it changes
  const setSelectedStoreId = (id: string | null) => {
    setSelectedStoreIdState(id)
    try {
      if (id) {
        localStorage.setItem(STORE_ID_STORAGE_KEY, id)
      } else {
        localStorage.removeItem(STORE_ID_STORAGE_KEY)
      }
    } catch (error) {
      console.warn("Failed to persist store ID to localStorage:", error)
    }
  }

  // Validate stored store ID against available stores
  useEffect(() => {
    if (selectedStoreId && stores.length > 0) {
      const storeExists = stores.some((s) => s.id === selectedStoreId)
      if (!storeExists) {
        // Stored store ID no longer exists, clear it
        setSelectedStoreId(null)
      }
    }
  }, [stores, selectedStoreId])

  return (
    <StoreContext.Provider
      value={{
        selectedStoreId,
        setSelectedStoreId,
        stores,
        setStores,
      }}
    >
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const context = useContext(StoreContext)
  if (context === undefined) {
    throw new Error("useStore must be used within a StoreProvider")
  }
  return context
}

