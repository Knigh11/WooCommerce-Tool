"""
V2 Upsell Combos API - Clean CRUD with expanded cards.
"""

from fastapi import APIRouter, HTTPException, status, Query
from app.deps import get_woo_client_for_store
from app.core.fbt_client import FBTAPIClient
from app.core.woo_client import WooClient
from app.core.v2.upsell_combo_repo import UpsellComboRepo
from app.core.v2.product_card_service import ProductCardService
from app.core.v2.upsell_combo_service import UpsellComboService
from app.schemas.v2.upsell_combos import (
    UpsellComboCreate,
    UpsellComboUpdate,
    UpsellComboOut,
    UpsellComboListResponse
)

router = APIRouter()


def get_fbt_client_for_store(store_id: str) -> FBTAPIClient:
    """Get FBT client for store"""
    from app.deps import get_store_by_id
    
    store = get_store_by_id(store_id)
    store_url = store.get("store_url")
    wp_username = store.get("wp_username")
    wp_app_password = store.get("wp_app_password")
    
    if not store_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Store URL not configured"
        )
    
    if not wp_username or not wp_app_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="WordPress credentials not configured"
        )
    
    return FBTAPIClient(store_url, wp_username, wp_app_password)


def get_upsell_combo_service(store_id: str) -> UpsellComboService:
    """Get UpsellComboService for store"""
    fbt_client = get_fbt_client_for_store(store_id)
    woo_client = get_woo_client_for_store(store_id)
    
    repo = UpsellComboRepo(fbt_client)
    card_service = ProductCardService(woo_client)
    
    return UpsellComboService(repo, card_service)


@router.get("", response_model=UpsellComboListResponse)
async def list_upsell_combos(
    store_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    search: str = Query("", description="Search query")
):
    """List upsell combos with expanded cards"""
    try:
        service = get_upsell_combo_service(store_id)
        combos, total = await service.list(page, page_size, search)
        return UpsellComboListResponse(items=combos, total=total, page=page, page_size=page_size)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error listing combos: {str(e)}"
        )


@router.get("/{combo_id}", response_model=UpsellComboOut)
async def get_upsell_combo(store_id: str, combo_id: int):
    """Get upsell combo with expanded cards"""
    try:
        service = get_upsell_combo_service(store_id)
        combo = await service.get(combo_id)
        if not combo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Combo {combo_id} not found"
            )
        return combo
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting combo: {str(e)}"
        )


@router.post("", response_model=UpsellComboOut)
async def create_upsell_combo(store_id: str, request: UpsellComboCreate):
    """Create upsell combo"""
    try:
        service = get_upsell_combo_service(store_id)
        combo = await service.create(request)
        return combo
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating combo: {str(e)}"
        )


@router.patch("/{combo_id}", response_model=UpsellComboOut)
async def update_upsell_combo(store_id: str, combo_id: int, request: UpsellComboUpdate):
    """Update upsell combo (partial)"""
    try:
        service = get_upsell_combo_service(store_id)
        combo = await service.update(combo_id, request)
        return combo
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating combo: {str(e)}"
        )


@router.delete("/{combo_id}")
async def delete_upsell_combo(store_id: str, combo_id: int):
    """Delete upsell combo"""
    try:
        service = get_upsell_combo_service(store_id)
        success = await service.delete(combo_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Combo {combo_id} not found"
            )
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting combo: {str(e)}"
        )

