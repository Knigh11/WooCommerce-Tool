"""
V2 API router - Clean, no legacy dependencies.
"""

from fastapi import APIRouter
from app.api.v2 import products, upsell_combos, bmsm_rules, desc_builder
from app.api import feeds

router = APIRouter()

router.include_router(products.router, prefix="/stores/{store_id}/products", tags=["v2-products"])
router.include_router(upsell_combos.router, prefix="/stores/{store_id}/upsell-combos", tags=["v2-upsell-combos"])
router.include_router(bmsm_rules.router, prefix="/stores/{store_id}/bmsm-rules", tags=["v2-bmsm-rules"])
router.include_router(desc_builder.router, prefix="/stores/{store_id}/desc-builder", tags=["v2-desc-builder"])
router.include_router(feeds.router)  # Feeds router prefix: /stores/{store_id}/feeds

