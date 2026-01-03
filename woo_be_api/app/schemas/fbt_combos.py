"""
FBT Combos API schemas.
Matching desktop app models and logic.
"""

from pydantic import BaseModel, Field, field_validator, model_validator
from typing import List, Optional, Literal


class DiscountRuleSchema(BaseModel):
    """Discount tier rule"""
    min: int = Field(..., ge=2, description="Minimum number of items in combo")
    rate: float = Field(..., gt=0, le=0.95, description="Discount rate as decimal (0.05 = 5%)")
    
    @field_validator('rate')
    @classmethod
    def validate_rate(cls, v):
        if v <= 0:
            raise ValueError("Discount rate must be > 0")
        if v > 0.95:
            raise ValueError("Discount rate must be <= 95% (0.95)")
        return v
    
    class Config:
        json_schema_extra = {
            "example": {
                "min": 2,
                "rate": 0.05
            }
        }


class ProductLiteSchema(BaseModel):
    """Lightweight product info for display"""
    id: int
    name: str
    type: str = "simple"
    price: Optional[str] = None
    stock_status: str = "instock"
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": 123,
                "name": "Product Name",
                "type": "simple",
                "price": "99.99",
                "stock_status": "instock"
            }
        }


class ComboBaseSchema(BaseModel):
    """Base combo schema with Apply Scope support"""
    enabled: bool = True
    apply_scope: Literal["main_only", "all_in_combo"] = "main_only"
    product_ids: List[int] = Field(..., min_items=2, description="All product IDs in combo group (includes mains)")
    main_ids: Optional[List[int]] = Field(None, description="Main product IDs (required for main_only scope)")
    priority: int = Field(0, ge=0, description="Higher priority = shown first when multiple combos match")
    discount_rules: List[DiscountRuleSchema] = Field(default_factory=list)
    
    @field_validator('product_ids')
    @classmethod
    def validate_product_ids(cls, v):
        if len(v) < 2:
            raise ValueError("Combo must contain at least 2 unique products")
        if len(v) != len(set(v)):
            raise ValueError("Duplicate products in product_ids")
        # Preserve order while removing duplicates
        seen = set()
        result = []
        for item in v:
            if item not in seen:
                seen.add(item)
                result.append(item)
        return result
    
    @model_validator(mode='after')
    def validate_main_ids(self):
        """Validate main_ids after all fields are set (cross-field validation)"""
        v = self.main_ids
        if v is None:
            return self
        
        if len(v) != len(set(v)):
            raise ValueError("Duplicate products in main_ids")
        
        # If main_only scope, validate main_ids
        if self.apply_scope == 'main_only':
            if not v or len(v) == 0:
                raise ValueError("main_only scope requires at least one main product")
            
            product_ids_set = set(self.product_ids)
            for main_id in v:
                if main_id not in product_ids_set:
                    raise ValueError(f"Main ID {main_id} must be included in product_ids")
        
        # Deduplicate while preserving order
        if v:
            seen = set()
            result = []
            for item in v:
                if item not in seen:
                    seen.add(item)
                    result.append(item)
            self.main_ids = result
        else:
            self.main_ids = []
        return self
    
    class Config:
        json_schema_extra = {
            "example": {
                "enabled": True,
                "apply_scope": "main_only",
                "product_ids": [1, 2, 3, 4],
                "main_ids": [1, 2],
                "priority": 0,
                "discount_rules": [
                    {"min": 2, "rate": 0.05},
                    {"min": 3, "rate": 0.10}
                ]
            }
        }


class ComboCreateRequest(ComboBaseSchema):
    """Request to create a new combo"""
    pass


class ComboUpdateRequest(ComboBaseSchema):
    """Request to update an existing combo"""
    pass


class ComboResponse(ComboBaseSchema):
    """Combo response with additional fields - allows invalid combos for display"""
    # Override product_ids to allow at least 1 item (instead of 2) for display purposes
    product_ids: List[int] = Field(..., min_items=1, description="All product IDs in combo group (includes mains)")
    main_id: int = Field(..., description="Primary main ID (for backward compatibility)")
    main_name: Optional[str] = None
    combo_ids: List[int] = Field(default_factory=list, description="Upsell items (excludes mains, legacy field)")
    updated_at: Optional[str] = None
    
    @field_validator('product_ids')
    @classmethod
    def validate_product_ids(cls, v):
        """Override: Allow product_ids with at least 1 item for display purposes"""
        if len(v) < 1:
            raise ValueError("Combo must contain at least 1 product")
        if len(v) != len(set(v)):
            raise ValueError("Duplicate products in product_ids")
        # Preserve order while removing duplicates
        seen = set()
        result = []
        for item in v:
            if item not in seen:
                seen.add(item)
                result.append(item)
        return result
    
    class Config:
        json_schema_extra = {
            "example": {
                "main_id": 1,
                "main_name": "Main Product",
                "enabled": True,
                "apply_scope": "main_only",
                "product_ids": [1, 2, 3, 4],
                "main_ids": [1, 2],
                "combo_ids": [3, 4],
                "priority": 0,
                "discount_rules": [
                    {"min": 2, "rate": 0.05}
                ],
                "updated_at": "2024-01-01T00:00:00Z"
            }
        }


class ComboListResponse(BaseModel):
    """Paginated combos list response"""
    page: int
    per_page: int
    total: int
    items: List[ComboResponse]
    skipped_count: int = Field(default=0, description="Number of invalid combos skipped")
    skipped_ids: Optional[List[int]] = Field(default=None, description="IDs of skipped combos (capped at 50)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "page": 1,
                "per_page": 50,
                "total": 100,
                "items": [],
                "skipped_count": 0,
                "skipped_ids": None
            }
        }


class ProductSearchRequest(BaseModel):
    """Product search request"""
    query: str = Field(..., min_length=1, description="Search query (name, SKU, or ID)")
    per_page: int = Field(20, ge=1, le=100)
    page: int = Field(1, ge=1)
    
    class Config:
        json_schema_extra = {
            "example": {
                "query": "product name",
                "per_page": 20,
                "page": 1
            }
        }


class ProductSearchResponse(BaseModel):
    """Product search response"""
    products: List[ProductLiteSchema]
    total: int
    
    class Config:
        json_schema_extra = {
            "example": {
                "products": [],
                "total": 0
            }
        }


class ComboResolveRequest(BaseModel):
    """Request to resolve recommendations for a product"""
    product_id: int = Field(..., description="Current product ID")
    
    class Config:
        json_schema_extra = {
            "example": {
                "product_id": 123
            }
        }


class ComboResolveResponse(BaseModel):
    """Resolved combo recommendations"""
    combo_id: Optional[int] = None  # main_id of matched combo
    recommended_product_ids: List[int] = Field(default_factory=list)
    discount_rules: List[DiscountRuleSchema] = Field(default_factory=list)
    
    class Config:
        json_schema_extra = {
            "example": {
                "combo_id": 1,
                "recommended_product_ids": [2, 3, 4],
                "discount_rules": [
                    {"min": 2, "rate": 0.05}
                ]
            }
        }

