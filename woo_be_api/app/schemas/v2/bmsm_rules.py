"""
V2 BMSM Rules schemas - Clean, scope-based.
"""

from pydantic import BaseModel, Field, field_validator, model_validator
from typing import List, Optional, Literal
from datetime import datetime
from app.schemas.v2.products import ProductCard


class BmsmTier(BaseModel):
    """BMSM discount tier (matching WP API format)"""
    min_qty: int = Field(..., ge=2, description="Minimum quantity (must be >= 2)")
    rate: float = Field(..., gt=0.0, le=0.95, description="Discount rate as decimal (0.05 = 5%)")
    
    @field_validator('rate')
    @classmethod
    def validate_rate(cls, v: float) -> float:
        """Validate rate is between 0 and 0.95"""
        if v <= 0 or v > 0.95:
            raise ValueError("Rate must be between 0 and 0.95 (0-95%)")
        return v
    
    class Config:
        json_schema_extra = {
            "example": {
                "min_qty": 2,
                "rate": 0.05
            }
        }


class BmsmRule(BaseModel):
    """BMSM rule base schema (matching WP API - rule tied to product_id)"""
    id: int = Field(..., description="Product ID (rule is stored in product meta)")
    enabled: bool = True
    tiers: List[BmsmTier] = Field(default_factory=list, description="Discount tiers")
    
    @model_validator(mode='after')
    def validate_tiers(self):
        """Validate tiers"""
        if self.tiers:
            min_qties = [t.min_qty for t in self.tiers]
            if len(min_qties) != len(set(min_qties)):
                raise ValueError("Duplicate min_qty in tiers")
            
            # Sort tiers by min_qty
            self.tiers = sorted(self.tiers, key=lambda t: t.min_qty)
        
        return self
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": 66299,
                "enabled": True,
                "tiers": [
                    {"min_qty": 2, "rate": 0.05}
                ]
            }
        }


class BmsmRuleCreate(BaseModel):
    """Request to create BMSM rule"""
    id: int = Field(..., description="Product ID")
    enabled: bool = True
    tiers: List[BmsmTier] = Field(default_factory=list)


class BmsmRuleUpdate(BaseModel):
    """Request to update BMSM rule (partial)"""
    enabled: Optional[bool] = None
    tiers: Optional[List[BmsmTier]] = None


class BmsmRuleOut(BmsmRule):
    """BMSM rule response with expanded product card"""
    product: ProductCard = Field(..., description="Product card for the rule (id, title, image_url)")
    stats: Optional[dict] = Field(None, description="Stats from WP index API (tier_count, max_rate, etc.)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": 66299,
                "enabled": True,
                "tiers": [{"min_qty": 2, "rate": 0.05}],
                "product": {
                    "id": 66299,
                    "title": "Product Name",
                    "image_url": "https://...",
                    "type": "simple"
                },
                "stats": {
                    "tier_count": 1,
                    "max_rate": 0.05
                }
            }
        }


class BmsmRuleListResponse(BaseModel):
    """Paginated list of BMSM rules"""
    items: List[BmsmRuleOut]
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

