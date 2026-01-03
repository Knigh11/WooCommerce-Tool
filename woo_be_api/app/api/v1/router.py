"""
Main API router for v1.
"""

from fastapi import APIRouter
from app.api.v1 import stores, products, jobs, images, sse, categories, reviews, product_editor, fbt_combos, bmsm

router = APIRouter()

router.include_router(stores.router, prefix="/stores", tags=["stores"])
router.include_router(categories.router, prefix="/stores/{store_id}/categories", tags=["categories"])
router.include_router(products.router, prefix="/stores/{store_id}/products", tags=["products"])
router.include_router(jobs.router, prefix="/stores/{store_id}/jobs", tags=["jobs"])
router.include_router(images.router, prefix="/img", tags=["images"])
router.include_router(sse.router, prefix="/stores/{store_id}/jobs/{job_id}/events", tags=["sse"])
# Also support query param format for compatibility: /stores/{store_id}/sse?job_id={job_id}
from app.api.v1.sse import stream_events_query
router.add_api_route(
    "/stores/{store_id}/sse",
    stream_events_query,
    methods=["GET"],
    tags=["sse"]
)
router.include_router(reviews.router, prefix="/stores/{store_id}/reviews", tags=["reviews"])
router.include_router(product_editor.router, prefix="/stores/{store_id}/products/editor", tags=["product-editor"])
router.include_router(fbt_combos.router, prefix="/stores/{store_id}/fbt-combos", tags=["fbt-combos"])
router.include_router(bmsm.router, prefix="/stores/{store_id}/bmsm", tags=["bmsm"])

