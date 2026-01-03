// V2 API Types

export interface ProductCard {
  id: number
  type: "simple" | "variable"
  title: string
  image_url: string | null
  sku: string | null
  price: string | null
}

export interface DiscountRule {
  min_items: number
  rate: number  // Decimal (0.05 = 5%)
}

export interface UpsellCombo {
  id: number | null
  name: string
  enabled: boolean
  main_ids: number[]
  product_ids: number[]  // Full group (mains + bundle)
  combo_ids: number[]    // Bundle/recommended items (from WP API)
  discount_rules: DiscountRule[]
  priority: number
  apply_scope: "main_only" | "all_in_combo"
  created_at: string | null
  updated_at: string | null
}

export interface UpsellComboOut extends UpsellCombo {
  main_products: ProductCard[]
  bundle_products: ProductCard[]
}

export interface UpsellComboCreate {
  name: string
  enabled?: boolean
  main_ids: number[]
  product_ids: number[]  // Full group (mains + bundle)
  combo_ids?: number[]    // Bundle items (will be calculated as product_ids - main_ids if not provided)
  discount_rules?: DiscountRule[]
  priority?: number
  apply_scope?: "main_only" | "all_in_combo"
}

export interface UpsellComboUpdate {
  name?: string
  enabled?: boolean
  main_ids?: number[]
  product_ids?: number[]  // Full group (mains + bundle)
  combo_ids?: number[]    // Bundle items (will be calculated as product_ids - main_ids if not provided)
  discount_rules?: DiscountRule[]
  priority?: number
  apply_scope?: "main_only" | "all_in_combo"
}

export interface BmsmTier {
  min_qty: number
  rate: number  // Decimal (0.05 = 5%)
}

export interface BmsmRule {
  id: number  // Product ID
  enabled: boolean
  tiers: BmsmTier[]
}

export interface BmsmRuleOut extends BmsmRule {
  product: ProductCard  // Product card for the rule
  stats?: {
    tier_count?: number
    max_rate?: number | null
    min_qty_min?: number | null
    min_qty_max?: number | null
    status?: string
  }
}

export interface BmsmRuleCreate {
  id: number  // product_id
  enabled?: boolean
  tiers?: BmsmTier[]
}

export interface BmsmRuleUpdate {
  enabled?: boolean
  tiers?: BmsmTier[]
}

