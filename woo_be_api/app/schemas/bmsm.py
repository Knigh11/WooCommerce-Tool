"""
BMSM (Buy More Save More) API schemas.
Matching desktop app models and logic.
"""

from pydantic import BaseModel, Field, field_validator, model_validator
from typing import List, Optional, Literal


class BMSMRuleSchema(BaseModel):
    """Single discount tier rule"""
    min: int = Field(..., ge=2, description="Minimum quantity (must be >= 2)")
    rate: float = Field(..., gt=0, le=0.95, description="Discount rate as decimal (0.05 = 5%)")
    
    @field_validator('rate')
    @classmethod
    def validate_rate(cls, v):
        if v <= 0:
            raise ValueError("Discount rate must be > 0")
        if v > 0.95:
            raise ValueError("Discount rate must be <= 0.95 (95%)")
        return v
    
    class Config:
        json_schema_extra = {
            "example": {
                "min": 2,
                "rate": 0.05
            }
        }


class BMSMRulesSchema(BaseModel):
    """BMSM rules for a product"""
    enabled: bool = Field(default=False, description="Whether BMSM is enabled for this product")
    rules: List[BMSMRuleSchema] = Field(default_factory=list, description="List of discount tier rules")
    
    @model_validator(mode='after')
    def validate_rules(self):
        """Validate rules after all fields are set"""
        # Check min >= 2
        for rule in self.rules:
            if rule.min < 2:
                raise ValueError(f"Minimum quantity must be >= 2 (found {rule.min})")
        
        # Check unique min values
        min_values = [rule.min for rule in self.rules]
        if len(min_values) != len(set(min_values)):
            raise ValueError("Duplicate minimum quantity values found")
        
        # Sort by min
        self.rules = sorted(self.rules, key=lambda r: r.min)
        return self
    
    class Config:
        json_schema_extra = {
            "example": {
                "enabled": True,
                "rules": [
                    {"min": 2, "rate": 0.05},
                    {"min": 3, "rate": 0.10}
                ]
            }
        }


class ProductSearchRequest(BaseModel):
    """Product search request"""
    query: str = Field("", description="Search query (name, SKU, or ID)")
    page: int = Field(1, ge=1)
    per_page: int = Field(20, ge=1, le=100)
    fields: Optional[List[str]] = Field(None, description="Optional list of fields to include")
    
    class Config:
        json_schema_extra = {
            "example": {
                "query": "product name",
                "page": 1,
                "per_page": 20
            }
        }


class ProductSearchResponse(BaseModel):
    """Product search response"""
    products: List[dict]
    total: int
    page: int
    per_page: int
    
    class Config:
        json_schema_extra = {
            "example": {
                "products": [],
                "total": 0,
                "page": 1,
                "per_page": 20
            }
        }


class ProductRulesResponse(BaseModel):
    """Product BMSM rules response"""
    product_id: int
    product_name: str
    rules: BMSMRulesSchema
    
    class Config:
        json_schema_extra = {
            "example": {
                "product_id": 123,
                "product_name": "Product Name",
                "rules": {
                    "enabled": True,
                    "rules": [{"min": 2, "rate": 0.05}]
                }
            }
        }


class ProductRulesUpdateRequest(BaseModel):
    """Request to update product BMSM rules"""
    rules: BMSMRulesSchema
    
    class Config:
        json_schema_extra = {
            "example": {
                "rules": {
                    "enabled": True,
                    "rules": [{"min": 2, "rate": 0.05}]
                }
            }
        }


class InventoryRowSchema(BaseModel):
    """Single row in inventory table"""
    product_id: int
    name: str
    type: str
    enabled: bool
    tier_count: int
    max_discount_percent: Optional[int]
    min_qty_range: str
    validity_status: str  # "valid", "invalid", "empty", "missing"
    
    class Config:
        json_schema_extra = {
            "example": {
                "product_id": 123,
                "name": "Product Name",
                "type": "simple",
                "enabled": True,
                "tier_count": 2,
                "max_discount_percent": 10,
                "min_qty_range": "2-5",
                "validity_status": "valid"
            }
        }


class InventoryIndexRequest(BaseModel):
    """Request to load BMSM inventory index"""
    page: int = Field(1, ge=1)
    per_page: int = Field(50, ge=1, le=100)
    search: str = Field("", description="Search query (product name or ID)")
    filter_type: Literal["all", "enabled", "disabled_with_rules", "invalid", "with_rules", "no_rules"] = "all"
    
    class Config:
        json_schema_extra = {
            "example": {
                "page": 1,
                "per_page": 50,
                "search": "",
                "filter_type": "all"
            }
        }


class InventoryIndexResponse(BaseModel):
    """BMSM inventory index response"""
    page: int
    per_page: int
    total: int
    items: List[InventoryRowSchema]
    summary: dict  # {scanned, enabled, disabled, with_rules, invalid}
    
    class Config:
        json_schema_extra = {
            "example": {
                "page": 1,
                "per_page": 50,
                "total": 100,
                "items": [],
                "summary": {
                    "scanned": 100,
                    "enabled": 50,
                    "disabled": 50,
                    "with_rules": 75,
                    "invalid": 5
                }
            }
        }

