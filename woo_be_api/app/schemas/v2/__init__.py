"""
V2 API schemas - Clean, minimal, no legacy dependencies.
"""

from app.schemas.v2.products import ProductCard, ProductCardListResponse
from app.schemas.v2.upsell_combos import (
    UpsellCombo,
    UpsellComboCreate,
    UpsellComboUpdate,
    UpsellComboOut,
    UpsellComboListResponse,
)
from app.schemas.v2.bmsm_rules import (
    BmsmRule,
    BmsmRuleCreate,
    BmsmRuleUpdate,
    BmsmRuleOut,
    BmsmRuleListResponse,
    BmsmTier,
)

__all__ = [
    "ProductCard",
    "ProductCardListResponse",
    "UpsellCombo",
    "UpsellComboCreate",
    "UpsellComboUpdate",
    "UpsellComboOut",
    "UpsellComboListResponse",
    "BmsmRule",
    "BmsmRuleCreate",
    "BmsmRuleUpdate",
    "BmsmRuleOut",
    "BmsmRuleListResponse",
    "BmsmTier",
]

