import { createContext, useContext, useState, ReactNode } from "react"
import { StoreSummary } from "../api/types"

interface StoreContextType {
  selectedStoreId: string | null
  setSelectedStoreId: (id: string | null) => void
  stores: StoreSummary[]
  setStores: (stores: StoreSummary[]) => void
}

const StoreContext = createContext<StoreContextType | undefined>(undefined)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null)
  const [stores, setStores] = useState<StoreSummary[]>([])

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

