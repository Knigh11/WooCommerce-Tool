// Leaf Items Panel Component

import { useTranslation } from "react-i18next"
import { Check, Search } from "lucide-react"
import React, { memo, useMemo, useState } from "react"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Skeleton } from "./ui/skeleton"
import { LeafItem } from "../utils/descriptionBuilderSchemas"

interface LeafItemsPanelProps {
  items: LeafItem[]
  selectedRelPaths: Set<string>
  onToggleSelection: (relPath: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  search: string
  onSearchChange: (value: string) => void
  category: string
  onCategoryChange: (value: string) => void
  showOnlyMissingDesc: boolean
  onShowOnlyMissingDescChange: (value: boolean) => void
  isLoading?: boolean
}

const LeafItemRow = memo(({
  item,
  isSelected,
  onToggle,
}: {
  item: LeafItem
  isSelected: boolean
  onToggle: () => void
}) => {
  const { t } = useTranslation()
  return (
    <div
      className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
        isSelected ? "bg-primary/10 border-primary" : "hover:bg-muted/50"
      }`}
      onClick={onToggle}
    >
      <div
        className={`flex h-5 w-5 items-center justify-center rounded border ${
          isSelected ? "bg-primary border-primary text-primary-foreground" : "border-input"
        }`}
      >
        {isSelected && <Check className="h-3 w-3" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{item.title}</div>
        <div className="text-sm text-muted-foreground truncate">
          {item.rel_path}
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs">
        {item.category && (
          <span className="rounded-full bg-secondary px-2 py-1">
            {item.category}
          </span>
        )}
        {item.has_description ? (
          <span className="text-green-600">{t("descBuilder.select.hasDesc")}</span>
        ) : (
          <span className="text-orange-600">{t("descBuilder.select.noDesc")}</span>
        )}
      </div>
    </div>
  )
})

LeafItemRow.displayName = "LeafItemRow"

export function LeafItemsPanel({
  items,
  selectedRelPaths,
  onToggleSelection,
  onSelectAll,
  onDeselectAll,
  search,
  onSearchChange,
  category,
  onCategoryChange,
  showOnlyMissingDesc,
  onShowOnlyMissingDescChange,
  isLoading,
}: LeafItemsPanelProps) {
  const { t } = useTranslation()
  // Derive categories from items
  const categories = useMemo(() => {
    const cats = new Set<string>()
    items.forEach((item) => {
      if (item.category) cats.add(item.category)
    })
    return Array.from(cats).sort()
  }, [items])

  // Filter items
  const filteredItems = useMemo(() => {
    let filtered = items

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(
        (item) =>
          item.title.toLowerCase().includes(searchLower) ||
          item.rel_path.toLowerCase().includes(searchLower) ||
          item.category?.toLowerCase().includes(searchLower)
      )
    }

    // Category filter
    if (category !== "ALL") {
      filtered = filtered.filter((item) => item.category === category)
    }

    // Missing description filter
    if (showOnlyMissingDesc) {
      filtered = filtered.filter((item) => !item.has_description)
    }

    return filtered
  }, [items, search, category, showOnlyMissingDesc])

  // Render at most 100 items initially
  const [visibleCount, setVisibleCount] = useState(100)
  const visibleItems = filteredItems.slice(0, visibleCount)
  const hasMore = filteredItems.length > visibleCount

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("descBuilder.select.title")}</CardTitle>
          <CardDescription>{t("descBuilder.select.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("descBuilder.select.title")}</CardTitle>
        <CardDescription>
          {t("descBuilder.select.selected", { selected: selectedRelPaths.size, total: items.length })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("descBuilder.select.searchPlaceholder")}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <Label className="text-xs">{t("descBuilder.select.categoryLabel")}</Label>
              <select
                value={category}
                onChange={(e) => onCategoryChange(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="ALL">{t("descBuilder.select.allCategories")}</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showOnlyMissingDesc}
                  onChange={(e) => onShowOnlyMissingDescChange(e.target.checked)}
                  className="rounded border-input"
                />
                <span>{t("descBuilder.select.onlyMissing")}</span>
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onSelectAll}>
              {t("descBuilder.select.selectAll", { count: filteredItems.length })}
            </Button>
            <Button variant="outline" size="sm" onClick={onDeselectAll}>
              {t("descBuilder.select.deselectAll")}
            </Button>
          </div>
        </div>

        {/* Items List */}
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {visibleItems.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("descBuilder.select.noFolders")}
            </div>
          ) : (
            visibleItems.map((item) => (
              <LeafItemRow
                key={item.id}
                item={item}
                isSelected={selectedRelPaths.has(item.rel_path)}
                onToggle={() => onToggleSelection(item.rel_path)}
              />
            ))
          )}

          {hasMore && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setVisibleCount((prev) => prev + 100)}
            >
              {t("descBuilder.select.loadMore", { remaining: filteredItems.length - visibleCount })}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

