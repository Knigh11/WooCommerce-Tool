// V2 Upsell Combos Page - Clean CRUD with ProductPicker

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Edit, Loader2, Package, Plus, Save, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { getProductCards } from "../api/v2/products"
import { DiscountRule, ProductCard, UpsellComboCreate, UpsellComboOut, UpsellComboUpdate } from "../api/v2/types"
import {
  createCombo,
  deleteCombo,
  getCombo,
  listCombos,
  updateCombo,
} from "../api/v2/upsellCombos"
import { PageHeader } from "../components/app/PageHeader"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog"
import { EmptyState } from "../components/ui/empty-state"
import { ErrorPanel } from "../components/ui/error-panel"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { SkeletonForm, SkeletonTable } from "../components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table"
import { TopProgressBar } from "../components/ui/top-progress-bar"
import { ProductPicker } from "../components/v2/ProductPicker"
import { SortableProductList } from "../components/v2/SortableProductList"
import { useStore } from "../state/storeContext"

export function UpsellCombosV2() {
  const { t } = useTranslation()
  const { selectedStoreId } = useStore()
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [pickerTarget, setPickerTarget] = useState<"main" | "bundle">("main")

  // Form state
  const [name, setName] = useState("")
  const [enabled, setEnabled] = useState(true)
  const [mainIds, setMainIds] = useState<number[]>([])
  const [bundleIds, setBundleIds] = useState<number[]>([])  // CRITICAL: Store bundle IDs separately (from combo_ids)
  const [discountRules, setDiscountRules] = useState<DiscountRule[]>([])
  const [priority, setPriority] = useState(0)
  const [applyScope, setApplyScope] = useState<"main_only" | "all_in_combo">("main_only")

  // Discount rule editor state
  const [isDiscountDialogOpen, setIsDiscountDialogOpen] = useState(false)
  const [editingDiscountIndex, setEditingDiscountIndex] = useState<number | null>(null)
  const [discountMinItems, setDiscountMinItems] = useState("2")
  const [discountRate, setDiscountRate] = useState("5")  // Percentage input

  // Product cards cache
  const [cardsCache, setCardsCache] = useState<Map<number, ProductCard>>(new Map())

  // List query
  const { data: combosData, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["v2", "upsellCombos", selectedStoreId],
    queryFn: () => listCombos(selectedStoreId!, { page: 1, page_size: 50 }),
    enabled: !!selectedStoreId,
    retry: 1,
  })

  // Load cards for displayed combos
  useEffect(() => {
    if (!combosData?.items || !selectedStoreId) return

    const allIds = new Set<number>()
    combosData.items.forEach((combo) => {
      combo.main_ids.forEach((id) => allIds.add(id))
      combo.product_ids.forEach((id) => allIds.add(id))
    })

    const missingIds = Array.from(allIds).filter((id) => !cardsCache.has(id))
    if (missingIds.length === 0) return

    getProductCards(selectedStoreId, missingIds).then((res) => {
      const newCache = new Map(cardsCache)
      res.items.forEach((card) => newCache.set(card.id, card))
      setCardsCache(newCache)
    })
  }, [combosData, selectedStoreId, cardsCache])

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: UpsellComboCreate) => createCombo(selectedStoreId!, data),
    onSuccess: (createdCombo: UpsellComboOut) => {
      // Hydrate cache from response (fix: ensure cards are available for immediate edit)
      const newCache = new Map(cardsCache)
      createdCombo.main_products.forEach((card) => {
        newCache.set(card.id, card)
      })
      createdCombo.bundle_products.forEach((card) => {
        newCache.set(card.id, card)
      })
      setCardsCache(newCache)

      queryClient.invalidateQueries({ queryKey: ["v2", "upsellCombos", selectedStoreId] })
      toast.success(t("upsell.comboCreated"))
      handleCloseModal()
    },
    onError: (err: any) => toast.error(err.message || t("upsell.failedToCreate")),
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpsellComboUpdate }) =>
      updateCombo(selectedStoreId!, id, data),
    onSuccess: (updatedCombo: UpsellComboOut) => {
      // Hydrate cache from response
      const newCache = new Map(cardsCache)
      updatedCombo.main_products.forEach((card) => {
        newCache.set(card.id, card)
      })
      updatedCombo.bundle_products.forEach((card) => {
        newCache.set(card.id, card)
      })
      setCardsCache(newCache)

      queryClient.invalidateQueries({ queryKey: ["v2", "upsellCombos", selectedStoreId] })
      toast.success(t("upsell.comboUpdated"))
      handleCloseModal()
    },
    onError: (err: any) => {
      const message = err.response?.status === 500
        ? t("upsell.serverError")
        : err.message || t("upsell.failedToUpdate")
      toast.error(message)
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteCombo(selectedStoreId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["v2", "upsellCombos", selectedStoreId] })
      toast.success("Combo deleted successfully")
    },
    onError: (err: any) => {
      const message = err.response?.status === 500
        ? t("upsell.serverError")
        : err.message || t("upsell.failedToDelete")
      toast.error(message)
    },
  })

  const handleNew = () => {
    setEditingId(null)
    setName("")
    setEnabled(true)
    setMainIds([])
    setBundleIds([])
    setDiscountRules([])
    setPriority(0)
    setApplyScope("main_only")
    setIsModalOpen(true)
  }

  // Detail query for edit modal
  const { data: detailCombo, isLoading: isLoadingDetail } = useQuery({
    queryKey: ["v2", "upsellCombos", selectedStoreId, editingId],
    queryFn: () => getCombo(selectedStoreId!, editingId!),
    enabled: !!editingId && !!selectedStoreId && isModalOpen,
  })

  // Update form when detail loads
  useEffect(() => {
    if (detailCombo && editingId) {
      setName(detailCombo.name)
      setEnabled(detailCombo.enabled)
      setMainIds([...detailCombo.main_ids])
      // CRITICAL: Use combo_ids for bundle (from WP API), not calculated from product_ids
      setBundleIds([...(detailCombo.combo_ids || [])])
      setDiscountRules([...detailCombo.discount_rules])
      setPriority(detailCombo.priority || 0)
      setApplyScope(detailCombo.apply_scope || "main_only")

      // Hydrate cache from expanded cards (fix: no N+1 requests, use BE expanded cards)
      const newCache = new Map(cardsCache)
      detailCombo.main_products.forEach((card) => {
        newCache.set(card.id, card)
      })
      detailCombo.bundle_products.forEach((card) => {
        newCache.set(card.id, card)
      })
      setCardsCache(newCache)
    }
  }, [detailCombo, editingId, cardsCache])

  const handleEdit = (combo: UpsellComboOut) => {
    setEditingId(combo.id!)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingId(null)
    setMainIds([])
    setBundleIds([])
    setDiscountRules([])
    setPriority(0)
    setApplyScope("main_only")
  }

  const handleAddDiscountRule = () => {
    setEditingDiscountIndex(null)
    setDiscountMinItems("2")
    setDiscountRate("5")
    setIsDiscountDialogOpen(true)
  }

  const handleEditDiscountRule = (index: number) => {
    const rule = discountRules[index]
    setEditingDiscountIndex(index)
    setDiscountMinItems(rule.min_items.toString())
    setDiscountRate((rule.rate * 100).toFixed(1))
    setIsDiscountDialogOpen(true)
  }

  const handleSaveDiscountRule = () => {
    const minItems = parseInt(discountMinItems, 10)
    const rate = parseFloat(discountRate) / 100.0  // Convert percentage to decimal

    if (isNaN(minItems) || minItems < 2) {
      toast.error(t("upsell.minItemsError"))
      return
    }
    if (isNaN(rate) || rate <= 0 || rate > 0.95) {
      toast.error(t("upsell.rateError"))
      return
    }

    // Check for duplicate min_items
    if (editingDiscountIndex === null) {
      if (discountRules.some((r) => r.min_items === minItems)) {
        toast.error(t("upsell.duplicateRule", { count: minItems }))
        return
      }
      setDiscountRules([...discountRules, { min_items: minItems, rate }])
    } else {
      const newRules = [...discountRules]
      // Check duplicate (excluding current index)
      if (newRules.some((r, i) => i !== editingDiscountIndex && r.min_items === minItems)) {
        toast.error(t("upsell.duplicateRule", { count: minItems }))
        return
      }
      newRules[editingDiscountIndex] = { min_items: minItems, rate }
      setDiscountRules(newRules)
    }

    setIsDiscountDialogOpen(false)
  }

  const handleRemoveDiscountRule = (index: number) => {
    setDiscountRules(discountRules.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    if (!name.trim()) {
      toast.error(t("upsell.nameRequired"))
      return
    }
    if (mainIds.length === 0) {
      toast.error(t("upsell.mainProductRequired"))
      return
    }

    // CRITICAL: product_ids = main_ids + bundle_ids (full group)
    // combo_ids = bundle_ids (what WP API stores as bundle)
    const productIds = [...new Set([...mainIds, ...bundleIds])]  // Dedupe and combine

    const data: UpsellComboCreate | UpsellComboUpdate = {
      name: name.trim(),
      enabled,
      main_ids: mainIds,
      product_ids: productIds,
      combo_ids: bundleIds,  // CRITICAL: Send bundle_ids as combo_ids to WP API
      discount_rules: discountRules,
      priority,
      apply_scope: applyScope,
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, data })
    } else {
      createMutation.mutate(data as UpsellComboCreate)
    }
  }

  const handleProductSelect = (product: ProductCard) => {
    // Add card to cache immediately (fix: show thumbnail + title right away)
    const newCache = new Map(cardsCache)
    newCache.set(product.id, product)
    setCardsCache(newCache)

    if (pickerTarget === "main") {
      if (!mainIds.includes(product.id)) {
        setMainIds([...mainIds, product.id])
      }
      // Remove from bundle if it was there
      setBundleIds(bundleIds.filter((id) => id !== product.id))
    } else {
      // Add to bundle (not main)
      if (!bundleIds.includes(product.id) && !mainIds.includes(product.id)) {
        setBundleIds([...bundleIds, product.id])
      }
    }
    setIsPickerOpen(false)
  }

  // Get cards preserving order (fix: ensure cards are available from cache)
  const mainCards = mainIds
    .map((id) => cardsCache.get(id))
    .filter((card): card is ProductCard => card !== undefined)
  // CRITICAL: Use bundleIds state (from combo_ids), not calculated from product_ids
  const bundleCards = bundleIds
    .map((id) => cardsCache.get(id))
    .filter((card): card is ProductCard => card !== undefined)

  if (!selectedStoreId) {
    return (
      <div>
        <PageHeader title={t("upsell.title")} />
        <div className="text-center py-8 text-muted-foreground">
          {t("upsell.selectStore")}
        </div>
      </div>
    )
  }

  // Helper to get readable error message
  const getErrorMessage = (err: any): string => {
    if (!err) return "An error occurred"
    if (err.response?.status === 401 || err.response?.status === 403) {
      return "Permission denied. Please check your store credentials."
    }
    if (err.response?.status === 500) {
      return "Server error. Please try again."
    }
    if (err.message?.includes("timeout") || err.message?.includes("Network")) {
      return "Store is slow to respond. Please try again."
    }
    return err.message || "Failed to load combos"
  }

  return (
    <div className="space-y-4 relative">
      <TopProgressBar active={isFetching && !isLoading} />

      <PageHeader
        title="Upsell Combos"
        actions={
          <Button onClick={handleNew} disabled={isFetching}>
            <Plus className="h-4 w-4 mr-2" />
            {t("upsell.newCombo")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("upsell.loadingData")}</p>
          <div className="border rounded-md p-4">
            <SkeletonTable rows={5} cols={7} />
          </div>
        </div>
      ) : error ? (
        <ErrorPanel
          title={t("upsell.failedToLoad")}
          message={getErrorMessage(error)}
          onRetry={() => refetch()}
        />
      ) : !combosData?.items || combosData.items.length === 0 ? (
        <EmptyState
          icon={<Package className="h-12 w-12 text-muted-foreground" />}
          title={t("upsell.noCombos")}
          description={t("upsell.noCombosDescription")}
          actionLabel={t("upsell.createComboButton")}
          onAction={handleNew}
        />
      ) : (
        <div
          className={`border rounded-md transition-opacity duration-200 ${isFetching ? "opacity-80 pointer-events-none" : "opacity-100"
            }`}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.id")}</TableHead>
                <TableHead>{t("upsell.name")}</TableHead>
                <TableHead>{t("upsell.mainProducts")}</TableHead>
                <TableHead>{t("upsell.bundleProducts")}</TableHead>
                <TableHead>{t("upsell.discount")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
                <TableHead>{t("upsell.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {combosData.items.map((combo) => (
                <TableRow key={combo.id}>
                  <TableCell className="font-mono">{combo.id}</TableCell>
                  <TableCell>{combo.name}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {combo.main_products.slice(0, 3).map((p) => (
                        <img
                          key={p.id}
                          src={p.image_url || ""}
                          alt={p.title}
                          className="w-8 h-8 object-cover rounded"
                          title={p.title}
                        />
                      ))}
                      {combo.main_products.length > 3 && (
                        <span className="text-xs text-muted-foreground">
                          +{combo.main_products.length - 3}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {combo.bundle_products.slice(0, 3).map((p) => (
                        <img
                          key={p.id}
                          src={p.image_url || ""}
                          alt={p.title}
                          className="w-8 h-8 object-cover rounded"
                          title={p.title}
                        />
                      ))}
                      {combo.bundle_products.length > 3 && (
                        <span className="text-xs text-muted-foreground">
                          +{combo.bundle_products.length - 3}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {combo.discount_rules.length > 0
                      ? combo.discount_rules
                        .sort((a, b) => a.min_items - b.min_items)
                        .map((r) => `${r.min_items}:${(r.rate * 100).toFixed(0)}%`)
                        .join(" | ")
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={combo.enabled ? "default" : "secondary"}>
                      {combo.enabled ? t("upsell.enabled") : t("upsell.disabled")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEdit(combo)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (window.confirm(t("upsell.deleteConfirm", { id: combo.id }))) {
                            deleteMutation.mutate(combo.id!)
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={handleCloseModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? t("upsell.editComboTitle") : t("upsell.newComboTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("upsell.configureDescription")}
            </DialogDescription>
          </DialogHeader>

          {editingId && isLoadingDetail ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">{t("upsell.loadingDetails")}</span>
              </div>
              <SkeletonForm fields={6} />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>{t("upsell.nameLabel")}</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("upsell.name")}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  disabled={createMutation.isPending || updateMutation.isPending}
                />
                <Label>{t("upsell.enabled")}</Label>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>{t("upsell.mainProducts")}</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPickerTarget("main")
                      setIsPickerOpen(true)
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {t("common.add")}
                  </Button>
                </div>
                <SortableProductList
                  items={mainIds}
                  cards={mainCards}
                  onReorder={setMainIds}
                  onRemove={(id) => {
                    setMainIds(mainIds.filter((i) => i !== id))
                    // Remove from bundle if it was there (shouldn't happen, but just in case)
                    setBundleIds(bundleIds.filter((i) => i !== id))
                  }}
                  label=""
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>{t("upsell.bundleProducts")}</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPickerTarget("bundle")
                      setIsPickerOpen(true)
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {t("common.add")}
                  </Button>
                </div>
                <SortableProductList
                  items={bundleIds}
                  cards={bundleCards}
                  onReorder={setBundleIds}
                  onRemove={(id) => {
                    setBundleIds(bundleIds.filter((i) => i !== id))
                  }}
                  label=""
                />
              </div>

              {/* Discount Rules Editor */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>{t("upsell.discountRules")}</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAddDiscountRule}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {t("upsell.addDiscountRule")}
                  </Button>
                </div>
                {discountRules.length > 0 ? (
                  <div className="border rounded-md divide-y">
                    {discountRules
                      .sort((a, b) => a.min_items - b.min_items)
                      .map((rule, index) => {
                        const originalIndex = discountRules.findIndex(
                          (r) => r.min_items === rule.min_items && r.rate === rule.rate
                        )
                        return (
                          <div
                            key={index}
                            className="p-2 flex items-center justify-between hover:bg-muted"
                          >
                            <div>
                              <span className="font-medium">{rule.min_items} {t("bmsm.items")}</span>
                              <span className="text-muted-foreground ml-2">
                                → {(rule.rate * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditDiscountRule(originalIndex)}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRemoveDiscountRule(originalIndex)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-2">{t("upsell.noDiscountRules")}</p>
                )}
              </div>

              {/* Discount Rule Dialog */}
              <Dialog open={isDiscountDialogOpen} onOpenChange={setIsDiscountDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {editingDiscountIndex === null ? t("upsell.addDiscountRuleTitle") : t("upsell.editDiscountRuleTitle")}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>{t("upsell.minItems")}</Label>
                      <Input
                        type="number"
                        value={discountMinItems}
                        onChange={(e) => setDiscountMinItems(e.target.value)}
                        min="2"
                      />
                    </div>
                    <div>
                      <Label>{t("upsell.discount")}</Label>
                      <Input
                        type="number"
                        value={discountRate}
                        onChange={(e) => setDiscountRate(e.target.value)}
                        min="0"
                        max="95"
                        step="0.1"
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => setIsDiscountDialogOpen(false)}>
                        {t("upsell.cancel")}
                      </Button>
                      <Button onClick={handleSaveDiscountRule}>
                        <Save className="h-4 w-4 mr-2" />
                        {t("upsell.save")}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="flex gap-2 justify-end pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={handleCloseModal}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {t("upsell.cancel")}
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={createMutation.isPending || updateMutation.isPending || (editingId ? isLoadingDetail : false)}
                >
                  {createMutation.isPending || updateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t("upsell.saving")}
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      {t("upsell.save")}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Product Picker */}
      <ProductPicker
        open={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={handleProductSelect}
        storeId={selectedStoreId}
        excludeIds={[...mainIds, ...bundleIds]}
        selectedIds={[...mainIds, ...bundleIds]}
      />
    </div>
  )
}

