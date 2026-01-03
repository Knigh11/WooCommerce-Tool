"""
V2 BMSM Rules API - Clean CRUD with expanded cards.
"""

from fastapi import APIRouter, HTTPException, status, Query
from app.deps import get_woo_client_for_store, get_store_by_id
from app.core.woo_client import WooClient
from app.core.bmsm_client import BmsmIndexClient
from app.core.v2.bmsm_rule_repo import BmsmRuleRepo
from app.core.v2.product_card_service import ProductCardService
from app.core.v2.bmsm_rule_service import BmsmRuleService
from app.schemas.v2.bmsm_rules import (
    BmsmRuleCreate,
    BmsmRuleUpdate,
    BmsmRuleOut,
    BmsmRuleListResponse
)

router = APIRouter()


def get_bmsm_index_client_for_store(store_id: str) -> BmsmIndexClient:
    """Get BMSM index client for store"""
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
            detail="WordPress credentials not configured. BMSM Index API requires WP username and app password."
        )
    
    return BmsmIndexClient(store_url, wp_username, wp_app_password)


def get_bmsm_rule_service(store_id: str) -> BmsmRuleService:
    """Get BmsmRuleService for store"""
    woo_client = get_woo_client_for_store(store_id)
    bmsm_client = get_bmsm_index_client_for_store(store_id)
    
    repo = BmsmRuleRepo(woo_client, bmsm_client)
    card_service = ProductCardService(woo_client)
    
    return BmsmRuleService(repo, card_service)


@router.get("", response_model=BmsmRuleListResponse)
async def list_bmsm_rules(
    store_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    search: str = Query("", description="Search query"),
    filter: str = Query("all", description="Filter type: all, enabled, disabled_with_rules, invalid, with_rules, no_rules")
):
    """List BMSM rules with expanded product cards"""
    try:
        service = get_bmsm_rule_service(store_id)
        rules, total = await service.list(page, page_size, search, filter)
        return BmsmRuleListResponse(items=rules, total=total, page=page, page_size=page_size)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error listing rules: {str(e)}"
        )


@router.get("/{rule_id}", response_model=BmsmRuleOut)
async def get_bmsm_rule(store_id: str, rule_id: int):
    """Get BMSM rule with expanded cards"""
    try:
        service = get_bmsm_rule_service(store_id)
        rule = await service.get(rule_id)
        if not rule:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Rule {rule_id} not found"
            )
        return rule
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting rule: {str(e)}"
        )


@router.post("", response_model=BmsmRuleOut)
async def create_bmsm_rule(store_id: str, request: BmsmRuleCreate):
    """Create BMSM rule"""
    try:
        service = get_bmsm_rule_service(store_id)
        rule = await service.create(request)
        return rule
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating rule: {str(e)}"
        )


@router.patch("/{rule_id}", response_model=BmsmRuleOut)
async def update_bmsm_rule(store_id: str, rule_id: int, request: BmsmRuleUpdate):
    """Update BMSM rule (partial)"""
    try:
        service = get_bmsm_rule_service(store_id)
        rule = await service.update(rule_id, request)
        return rule
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating rule: {str(e)}"
        )


@router.delete("/{rule_id}")
async def delete_bmsm_rule(store_id: str, rule_id: int):
    """Delete BMSM rule"""
    try:
        service = get_bmsm_rule_service(store_id)
        success = await service.delete(rule_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Rule {rule_id} not found"
            )
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting rule: {str(e)}"
        )

