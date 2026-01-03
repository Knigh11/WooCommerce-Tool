// V2 BMSM Rules Page - Clean CRUD matching WP API

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Edit, Loader2, Percent, Plus, Save, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import {
  createRule,
  deleteRule,
  getRule,
  listRules,
  updateRule,
} from "../api/v2/bmsmRules"
import { BmsmRuleCreate, BmsmRuleOut, BmsmRuleUpdate, BmsmTier, ProductCard } from "../api/v2/types"
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
import { useStore } from "../state/storeContext"

export function BMSMRulesV2() {
  const { t } = useTranslation()
  const { selectedStoreId } = useStore()
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isTierDialogOpen, setIsTierDialogOpen] = useState(false)
  const [editingTierIndex, setEditingTierIndex] = useState<number | null>(null)
  const [productId, setProductId] = useState("")  // For new rule creation (manual fallback)
  const [selectedProduct, setSelectedProduct] = useState<ProductCard | null>(null)  // Selected from picker
  const [isPickerOpen, setIsPickerOpen] = useState(false)

  // Form state
  const [enabled, setEnabled] = useState(true)
  const [tiers, setTiers] = useState<BmsmTier[]>([])

  // Tier form (percent input, converted to decimal)
  const [tierMinQty, setTierMinQty] = useState("2")
  const [tierRatePercent, setTierRatePercent] = useState("5")  // User inputs as percent (5 = 5%)

  // List query
  const { data: rulesData, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["v2", "bmsmRules", selectedStoreId],
    queryFn: () => listRules(selectedStoreId!, { page: 1, page_size: 50 }),
    enabled: !!selectedStoreId,
    retry: 1,
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: BmsmRuleCreate) => createRule(selectedStoreId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["v2", "bmsmRules", selectedStoreId] })
      toast.success(t("bmsm.ruleCreated"))
      handleCloseModal()
    },
    onError: (err: any) => {
      const message = err.response?.status === 500
        ? t("bmsm.serverError")
        : err.message || t("bmsm.failedToCreate")
      toast.error(message)
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: BmsmRuleUpdate }) =>
      updateRule(selectedStoreId!, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["v2", "bmsmRules", selectedStoreId] })
      queryClient.invalidateQueries({ queryKey: ["v2", "bmsmRules", selectedStoreId, editingId] })
      toast.success(t("bmsm.ruleUpdated"))
      handleCloseModal()
    },
    onError: (err: any) => {
      const message = err.response?.status === 500
        ? t("bmsm.serverError")
        : err.message || t("bmsm.failedToUpdate")
      toast.error(message)
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteRule(selectedStoreId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["v2", "bmsmRules", selectedStoreId] })
      toast.success(t("bmsm.ruleDeleted"))
    },
    onError: (err: any) => {
      const message = err.response?.status === 500
        ? t("bmsm.serverError")
        : err.message || t("bmsm.failedToDelete")
      toast.error(message)
    },
  })

  const handleNew = () => {
    setEditingId(null)
    setProductId("")
    setSelectedProduct(null)
    setEnabled(true)
    setTiers([])
    setIsModalOpen(true)
  }

  // Detail query for edit modal
  const { data: detailRule, isLoading: isLoadingDetail } = useQuery({
    queryKey: ["v2", "bmsmRules", selectedStoreId, editingId],
    queryFn: () => getRule(selectedStoreId!, editingId!),
    enabled: !!editingId && !!selectedStoreId && isModalOpen,
    retry: 1,
  })

  // Update form when detail loads
  useEffect(() => {
    if (detailRule && editingId) {
      setEnabled(detailRule.enabled)
      setTiers([...detailRule.tiers])
    }
  }, [detailRule, editingId])

  const handleEdit = (rule: BmsmRuleOut) => {
    setEditingId(rule.id)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingId(null)
    setProductId("")
    setSelectedProduct(null)
    setTiers([])
  }

  const handleProductSelect = (product: ProductCard) => {
    setSelectedProduct(product)
    setProductId(product.id.toString())
    setIsPickerOpen(false)
  }

  const handleSave = () => {
    if (editingId) {
      const data: BmsmRuleUpdate = {
        enabled,
        tiers,
      }
      updateMutation.mutate({ id: editingId, data })
    } else {
      // Use selected product ID or manual input
      const productIdNum = selectedProduct?.id || parseInt(productId, 10)
      if (!productIdNum || productIdNum <= 0) {
        toast.error(t("bmsm.selectProductError"))
        return
      }
      const data: BmsmRuleCreate = {
        id: productIdNum,
        enabled,
        tiers,
      }
      createMutation.mutate(data)
    }
  }

  const handleAddTier = () => {
    setEditingTierIndex(null)
    setTierMinQty("2")
    setTierRatePercent("5")
    setIsTierDialogOpen(true)
  }

  const handleEditTier = (index: number) => {
    const tier = tiers[index]
    setEditingTierIndex(index)
    setTierMinQty(tier.min_qty.toString())
    // Convert decimal rate to percent for display
    setTierRatePercent((tier.rate * 100).toFixed(1))
    setIsTierDialogOpen(true)
  }

  const handleSaveTier = () => {
    const minQty = parseInt(tierMinQty, 10)
    const ratePercent = parseFloat(tierRatePercent)

    if (isNaN(minQty) || minQty < 2) {
      toast.error(t("bmsm.minQtyError"))
      return
    }
    if (isNaN(ratePercent) || ratePercent <= 0 || ratePercent > 95) {
      toast.error(t("bmsm.rateError"))
      return
    }

    // Check duplicate min_qty
    const existing = tiers.find((t, i) => i !== editingTierIndex && t.min_qty === minQty)
    if (existing) {
      toast.error(t("bmsm.duplicateTier", { qty: minQty }))
      return
    }

    // CRITICAL: Convert percent to decimal (5% -> 0.05)
    const rate = ratePercent / 100.0

    const tier: BmsmTier = {
      min_qty: minQty,
      rate: rate,  // Store as decimal
    }

    if (editingTierIndex !== null) {
      const newTiers = [...tiers]
      newTiers[editingTierIndex] = tier
      setTiers(newTiers)
    } else {
      setTiers([...tiers, tier])
    }

    setIsTierDialogOpen(false)
  }

  const handleRemoveTier = (index: number) => {
    setTiers(tiers.filter((_, i) => i !== index))
  }

  if (!selectedStoreId) {
    return (
      <div>
        <PageHeader title={t("bmsm.title")} />
        <div className="text-center py-8 text-muted-foreground">
          {t("bmsm.selectStore")}
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
    return err.message || "Failed to load rules"
  }

  return (
    <div className="space-y-4 relative">
      <TopProgressBar active={isFetching && !isLoading} />

      <PageHeader
        title={t("bmsm.title")}
        actions={
          <Button onClick={handleNew} disabled={isFetching}>
            <Plus className="h-4 w-4 mr-2" />
            {t("bmsm.newRule")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("bmsm.loadingData")}</p>
          <div className="border rounded-md p-4">
            <SkeletonTable rows={5} cols={4} />
          </div>
        </div>
      ) : error ? (
        <ErrorPanel
          title={t("bmsm.failedToLoad")}
          message={getErrorMessage(error)}
          onRetry={() => refetch()}
        />
      ) : !rulesData?.items || rulesData.items.length === 0 ? (
        <EmptyState
          icon={<Percent className="h-12 w-12 text-muted-foreground" />}
          title={t("bmsm.noRules")}
          description={t("bmsm.noRulesDescription")}
          actionLabel={t("bmsm.createRuleButton")}
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
                <TableHead>{t("bmsm.product")}</TableHead>
                <TableHead>{t("bmsm.tiers")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
                <TableHead>{t("bmsm.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rulesData.items.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {rule.product.image_url ? (
                        <img
                          src={rule.product.image_url}
                          alt={rule.product.title}
                          className="w-10 h-10 object-cover rounded"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                          <span className="text-xs text-muted-foreground">{t("bmsm.noImage")}</span>
                        </div>
                      )}
                      <div>
                        <div className="font-medium">{rule.product.title}</div>
                        <div className="text-sm text-muted-foreground">ID: {rule.id}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {rule.stats?.tier_count && rule.stats.tier_count > 0 ? (
                      <div className="text-sm">
                        {rule.stats.tier_count} tier{rule.stats.tier_count !== 1 ? "s" : ""}
                        {rule.stats.min_qty_min && rule.stats.min_qty_max && (
                          <> ({rule.stats.min_qty_min}–{rule.stats.min_qty_max}</>
                        )}
                        {rule.stats.max_rate && (
                          <>, max {((rule.stats.max_rate || 0) * 100).toFixed(0)}%</>
                        )}
                        {rule.stats.min_qty_min && rule.stats.min_qty_max && <>)</>}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">{t("bmsm.noTiers")}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={rule.enabled ? "default" : "secondary"}>
                      {rule.enabled ? t("bmsm.enabled") : t("bmsm.disabled")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEdit(rule)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (window.confirm(t("bmsm.deleteConfirm", { id: rule.id }))) {
                            deleteMutation.mutate(rule.id)
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
              {editingId
                ? t("bmsm.editRuleTitle", { title: detailRule?.product.title || rulesData?.items.find(r => r.id === editingId)?.product.title || `Product #${editingId}` })
                : t("bmsm.newRuleTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("bmsm.configureDescription")}
            </DialogDescription>
          </DialogHeader>

          {editingId && isLoadingDetail ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">{t("bmsm.loadingDetails")}</span>
              </div>
              <SkeletonForm fields={4} />
            </div>
          ) : (
            <div className="space-y-4">
              {!editingId && (
                <div>
                  <Label>{t("bmsm.productLabel")}</Label>
                  <div className="space-y-2">
                    {selectedProduct ? (
                      <div className="flex items-center gap-3 p-3 border rounded-md bg-muted/50">
                        {selectedProduct.image_url ? (
                          <img
                            src={selectedProduct.image_url}
                            alt={selectedProduct.title}
                            className="w-12 h-12 object-cover rounded"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                            <span className="text-xs text-muted-foreground">{t("bmsm.noImage")}</span>
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="font-medium">{selectedProduct.title}</div>
                          <div className="text-sm text-muted-foreground">ID: {selectedProduct.id}</div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedProduct(null)
                            setProductId("")
                          }}
                        >
                          {t("bmsm.change")}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => setIsPickerOpen(true)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          {t("bmsm.searchProduct")}
                        </Button>
                        <div className="text-center text-sm text-muted-foreground">{t("bmsm.or")}</div>
                        <Input
                          type="number"
                          value={productId}
                          onChange={(e) => setProductId(e.target.value)}
                          placeholder={t("bmsm.enterProductId")}
                        />
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("bmsm.selectProductHint")}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                <Label>{t("bmsm.enabled")}</Label>
              </div>

              {/* Tiers Editor */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>{t("bmsm.discountTiers")}</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAddTier}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {t("bmsm.addTier")}
                  </Button>
                </div>
                {tiers.length > 0 ? (
                  <div className="border rounded-md divide-y">
                    {tiers
                      .sort((a, b) => a.min_qty - b.min_qty)
                      .map((tier, index) => {
                        const originalIndex = tiers.findIndex(
                          (t) => t.min_qty === tier.min_qty && t.rate === tier.rate
                        )
                        return (
                          <div
                            key={index}
                            className="p-2 flex items-center justify-between hover:bg-muted"
                          >
                            <div>
                              <span className="font-medium">{tier.min_qty} {t("bmsm.items")}</span>
                              <span className="text-muted-foreground ml-2">
                                → {(tier.rate * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditTier(originalIndex)}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRemoveTier(originalIndex)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-2">{t("bmsm.noTiersConfigured")}</p>
                )}
              </div>

              {/* Tier Dialog */}
              <Dialog open={isTierDialogOpen} onOpenChange={setIsTierDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {editingTierIndex === null ? "Add" : "Edit"} Discount Tier
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>{t("bmsm.tierMinQty")}</Label>
                      <Input
                        type="number"
                        value={tierMinQty}
                        onChange={(e) => setTierMinQty(e.target.value)}
                        min="2"
                      />
                    </div>
                    <div>
                      <Label>{t("bmsm.tierDiscount")}</Label>
                      <Input
                        type="number"
                        value={tierRatePercent}
                        onChange={(e) => setTierRatePercent(e.target.value)}
                        min="0"
                        max="95"
                        step="0.1"
                        placeholder="5"
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        {t("bmsm.enterAsPercentage")}
                      </p>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => setIsTierDialogOpen(false)}>
                        {t("bmsm.cancel")}
                      </Button>
                      <Button onClick={handleSaveTier}>
                        <Save className="h-4 w-4 mr-2" />
                        {t("bmsm.save")}
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
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={createMutation.isPending || updateMutation.isPending || (editingId ? isLoadingDetail : false)}
                >
                  {createMutation.isPending || updateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save
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
        excludeIds={[]}
        selectedIds={selectedProduct ? [selectedProduct.id] : []}
      />
    </div>
  )
}
