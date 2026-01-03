"""
V2 Products API - ProductCard search and fetch.
"""

from fastapi import APIRouter, HTTPException, status, Query
from app.deps import get_woo_client_for_store
from app.core.woo_client import WooClient
from app.core.v2.product_card_service import ProductCardService
from app.schemas.v2.products import ProductCard, ProductCardListResponse
from pydantic import BaseModel

router = APIRouter()


class ProductCardsRequest(BaseModel):
    """Request to get product cards by IDs"""
    ids: list[int]


def get_product_card_service(store_id: str) -> ProductCardService:
    """Get ProductCardService for store"""
    woo_client = get_woo_client_for_store(store_id)
    return ProductCardService(woo_client)


@router.get("/search", response_model=ProductCardListResponse)
async def search_products(
    store_id: str,
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(20, ge=1, le=100, description="Result limit")
):
    """Search products and return ProductCards"""
    try:
        service = get_product_card_service(store_id)
        cards = await service.search(q, limit)
        return ProductCardListResponse(items=cards)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error searching products: {str(e)}"
        )
    finally:
        try:
            woo_client = get_woo_client_for_store(store_id)
            await woo_client.close()
        except:
            pass


@router.post("/cards", response_model=ProductCardListResponse)
async def get_product_cards(
    store_id: str,
    request: ProductCardsRequest
):
    """Get ProductCards for given IDs (order-preserving)"""
    try:
        service = get_product_card_service(store_id)
        cards = await service.get_cards(request.ids)
        return ProductCardListResponse(items=cards)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching product cards: {str(e)}"
        )
    finally:
        try:
            woo_client = get_woo_client_for_store(store_id)
            await woo_client.close()
        except:
            pass

