"""
Main API router for v1.
"""

from fastapi import APIRouter
from app.api.v1 import stores, products, jobs, images, sse, categories, reviews, product_editor

router = APIRouter()

router.include_router(stores.router, prefix="/stores", tags=["stores"])
router.include_router(categories.router, prefix="/stores/{store_id}/categories", tags=["categories"])
router.include_router(products.router, prefix="/stores/{store_id}/products", tags=["products"])
router.include_router(jobs.router, prefix="/stores/{store_id}/jobs", tags=["jobs"])
router.include_router(images.router, prefix="/img", tags=["images"])
router.include_router(sse.router, prefix="/stores/{store_id}/jobs/{job_id}/events", tags=["sse"])
router.include_router(reviews.router, prefix="/stores/{store_id}/reviews", tags=["reviews"])
router.include_router(product_editor.router, prefix="/stores/{store_id}/products/editor", tags=["product-editor"])

