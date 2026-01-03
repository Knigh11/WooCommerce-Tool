// V2 ProductPicker Component - Search and select products with drag-drop reorder

import { useState, useEffect, useMemo } from "react"
import { Search, X, Plus, Loader2 } from "lucide-react"
import { Input } from "../ui/input"
import { Button } from "../ui/button"
import { InlineLoader } from "../ui/inline-loader"
import { SkeletonLine, SkeletonAvatar } from "../ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog"
import { ProductCard } from "../../api/v2/types"
import { searchProducts } from "../../api/v2/products"
import { SortableProductList } from "./SortableProductList"

interface ProductPickerProps {
  open: boolean
  onClose: () => void
  onSelect: (product: ProductCard) => void
  storeId: string | null
  excludeIds?: number[]
  selectedIds?: number[]
}

export function ProductPicker({
  open,
  onClose,
  onSelect,
  storeId,
  excludeIds = [],
  selectedIds = [],
}: ProductPickerProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [searchResults, setSearchResults] = useState<ProductCard[]>([])
  const [isSearching, setIsSearching] = useState(false)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Search products
  useEffect(() => {
    if (!storeId || !debouncedQuery.trim()) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    searchProducts(storeId, debouncedQuery, 20)
      .then((res) => {
        // Filter out excluded and already selected
        const filtered = res.items.filter(
          (p) => !excludeIds.includes(p.id) && !selectedIds.includes(p.id)
        )
        setSearchResults(filtered)
      })
      .catch((err) => {
        console.error("Search error:", err)
        setSearchResults([])
      })
      .finally(() => setIsSearching(false))
  }, [storeId, debouncedQuery, excludeIds, selectedIds])

  const handleSelect = (product: ProductCard) => {
    onSelect(product)
    setSearchQuery("")
    setSearchResults([])
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Search Products</DialogTitle>
          <DialogDescription>
            Search and select products to add
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, SKU, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Search Results */}
          {isSearching && (
            <div className="border rounded-md p-4">
              <InlineLoader text="Searching…" />
            </div>
          )}

          {!isSearching && searchResults.length > 0 && (
            <div className="border rounded-md max-h-64 overflow-y-auto">
              <div className="divide-y">
                {searchResults.map((product) => (
                  <div
                    key={product.id}
                    className="p-3 hover:bg-muted cursor-pointer flex items-center gap-3 transition-colors duration-150"
                    onClick={() => handleSelect(product)}
                  >
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.title}
                        className="w-12 h-12 object-cover rounded"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                        <span className="text-xs text-muted-foreground">
                          No Image
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{product.title}</div>
                      <div className="text-sm text-muted-foreground">
                        ID: {product.id} {product.sku && `| SKU: ${product.sku}`}
                      </div>
                    </div>
                    <Button size="sm" variant="outline">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isSearching && debouncedQuery && searchResults.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No results. Try a different keyword.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

