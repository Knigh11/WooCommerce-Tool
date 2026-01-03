"""
V2 Upsell Combos schemas - Clean, order-preserving.
"""

from pydantic import BaseModel, Field, field_validator, model_validator
from typing import List, Optional, Literal
from datetime import datetime
from app.schemas.v2.products import ProductCard


class DiscountRuleSchema(BaseModel):
    """Discount rule for combo (matching desktop app)"""
    min_items: int = Field(..., ge=2, description="Minimum number of items in combo")
    rate: float = Field(..., ge=0.0, le=0.95, description="Discount rate as decimal (0.05 = 5%)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "min_items": 2,
                "rate": 0.05
            }
        }


class UpsellCombo(BaseModel):
    """Upsell combo base schema (matching desktop app structure)"""
    id: Optional[int] = None  # Will be set by repo (uses main_id from FBT API)
    name: str = Field(..., min_length=1)
    enabled: bool = True
    main_ids: List[int] = Field(..., min_items=1, description="Main product IDs (ORDER SENSITIVE)")
    product_ids: List[int] = Field(..., min_items=1, description="All product IDs including mains (ORDER SENSITIVE)")
    combo_ids: List[int] = Field(default_factory=list, description="Bundle/recommended product IDs from WP API (ORDER SENSITIVE)")
    discount_rules: List[DiscountRuleSchema] = Field(default_factory=list, description="Discount rules (matching desktop app)")
    priority: int = Field(0, description="Priority (higher = shown first)")
    apply_scope: Literal["main_only", "all_in_combo"] = Field("main_only", description="Apply scope mode")
    created_at: Optional[str] = None  # Keep as string for API compatibility
    updated_at: Optional[str] = None  # Keep as string for API compatibility
    
    @field_validator('main_ids', 'product_ids')
    @classmethod
    def dedupe_preserve_order(cls, v: List[int]) -> List[int]:
        """Deduplicate while preserving order of first occurrence"""
        seen = set()
        result = []
        for item in v:
            if item not in seen:
                seen.add(item)
                result.append(item)
        return result
    
    @model_validator(mode='after')
    def validate_relationships(self):
        """Validate main_ids are subset of product_ids and discount rules"""
        main_set = set(self.main_ids)
        product_set = set(self.product_ids)
        
        if not main_set.issubset(product_set):
            missing = main_set - product_set
            raise ValueError(f"main_ids contains products not in product_ids: {missing}")
        
        # Validate discount rules: no duplicate min_items
        min_items_list = [rule.min_items for rule in self.discount_rules]
        if len(min_items_list) != len(set(min_items_list)):
            raise ValueError("Duplicate min_items in discount_rules")
        
        # Sort discount rules by min_items
        self.discount_rules = sorted(self.discount_rules, key=lambda r: r.min_items)
        
        return self
    
    class Config:
        json_schema_extra = {
            "example": {
                "name": "Combo Name",
                "enabled": True,
                "main_ids": [1, 2],
                "product_ids": [1, 2, 3, 4],
                "discount_type": "percent",
                "discount_value": 10.0
            }
        }


class UpsellComboCreate(BaseModel):
    """Request to create upsell combo"""
    name: str = Field(..., min_length=1)
    enabled: bool = True
    main_ids: List[int] = Field(..., min_items=1)
    product_ids: List[int] = Field(..., min_items=1)
    combo_ids: List[int] = Field(default_factory=list, description="Bundle items (will be calculated if not provided)")
    discount_rules: List[DiscountRuleSchema] = Field(default_factory=list)
    priority: int = 0
    apply_scope: Literal["main_only", "all_in_combo"] = "main_only"


class UpsellComboUpdate(BaseModel):
    """Request to update upsell combo (partial)"""
    name: Optional[str] = Field(None, min_length=1)
    enabled: Optional[bool] = None
    main_ids: Optional[List[int]] = Field(None, min_items=1)
    product_ids: Optional[List[int]] = Field(None, min_items=1)
    combo_ids: Optional[List[int]] = Field(None, description="Bundle items")
    discount_rules: Optional[List[DiscountRuleSchema]] = None
    priority: Optional[int] = None
    apply_scope: Optional[Literal["main_only", "all_in_combo"]] = None


class UpsellComboOut(UpsellCombo):
    """Upsell combo response with expanded product cards"""
    main_products: List[ProductCard] = Field(default_factory=list, description="Expanded main products (ORDER PRESERVED)")
    bundle_products: List[ProductCard] = Field(default_factory=list, description="Expanded bundle products (ORDER PRESERVED)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": 1,
                "name": "Combo Name",
                "enabled": True,
                "main_ids": [1, 2],
                "product_ids": [1, 2, 3, 4],
                "discount_rules": [{"min_items": 2, "rate": 0.05}],
                "priority": 0,
                "apply_scope": "main_only",
                "main_products": [],
                "bundle_products": []
            }
        }


class UpsellComboListResponse(BaseModel):
    """Paginated list of upsell combos"""
    items: List[UpsellComboOut]
    total: int
    page: int = 1
    page_size: int = 50
    
    class Config:
        json_schema_extra = {
            "example": {
                "items": [],
                "total": 0,
                "page": 1,
                "page_size": 50
            }
        }

