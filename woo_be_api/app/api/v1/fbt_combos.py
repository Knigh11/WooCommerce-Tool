"""
FBT Combos API endpoints.
Matching desktop app functionality exactly.
No duplicate validation/migration logic - let Pydantic schemas handle validation.
"""

import logging
from fastapi import APIRouter, HTTPException, status, Query
from typing import Optional

logger = logging.getLogger(__name__)

from app.deps import get_woo_client_for_store, get_wp_client_for_store
from app.core.fbt_client import FBTAPIClient
from app.core.woo_client import WooClient
from app.core.ops.fbt_combos import (
    list_combos, list_all_combos, get_combo, save_combo, delete_combo,
    search_products, resolve_recommendations
)
from app.schemas.fbt_combos import (
    ComboCreateRequest, ComboUpdateRequest, ComboResponse, ComboListResponse,
    ProductSearchRequest, ProductSearchResponse,
    ComboResolveRequest, ComboResolveResponse
)

router = APIRouter()


def get_fbt_client_for_store(store_id: str) -> FBTAPIClient:
    """
    Get FBT client for a store.
    Requires WP credentials.
    """
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
            detail="WordPress credentials not configured. FBT API requires WP username and app password."
        )
    
    return FBTAPIClient(store_url, wp_username, wp_app_password)


@router.get("/all", response_model=ComboListResponse)
async def list_all_combos_endpoint(
    store_id: str,
    search: str = Query("", description="Search query")
):
    """
    Get ALL combos (no pagination).
    Fetches all combos from all pages.
    """
    try:
        fbt_client = get_fbt_client_for_store(store_id)
        success, combos, error = await list_all_combos(fbt_client, search)
        
        if not success:
            logger.error(f"Failed to list all combos: {error}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=error or "Failed to list all combos"
            )
        
        # Convert to response format - show all combos, even invalid ones
        combo_responses = []
        
        for combo in combos:
            try:
                combo_responses.append(ComboResponse(**combo))
            except Exception as e:
                # Still include invalid combos, but log warning
                combo_id = combo.get("main_id", combo.get("id", 0))
                logger.warning(f"Combo {combo_id}: Schema validation failed: {str(e)}, but including anyway")
                # Try to create response with minimal validation
                try:
                    # Use model_validate with from_attributes to be more lenient
                    combo_responses.append(ComboResponse.model_validate(combo, strict=False))
                except Exception as e2:
                    # If still fails, create a minimal response manually
                    combo_responses.append(ComboResponse(
                        main_id=combo_id,
                        main_name=combo.get("main_name"),
                        enabled=combo.get("enabled", True),
                        apply_scope=combo.get("apply_scope", "main_only"),
                        product_ids=combo.get("product_ids", [combo_id]) if combo.get("product_ids") else [combo_id],
                        main_ids=combo.get("main_ids", [combo_id]) if combo.get("main_ids") else [combo_id],
                        priority=combo.get("priority", 0),
                        discount_rules=combo.get("discount_rules", []),
                        combo_ids=combo.get("combo_ids", []),
                        updated_at=combo.get("updated_at")
                    ))
        
        return ComboListResponse(
            page=1,
            per_page=len(combo_responses),
            total=len(combo_responses),
            items=combo_responses,
            skipped_count=0,
            skipped_ids=None
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error listing all combos for store {store_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error listing all combos: {str(e)}"
        )


@router.get("", response_model=ComboListResponse)
async def list_combos_endpoint(
    store_id: str,
    search: str = Query("", description="Search query"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(50, ge=1, le=100, description="Items per page")
):
    """
    List combos with pagination and search.
    Matching desktop app list_combos functionality.
    Note: Desktop app doesn't return total, but backend needs it for pagination.
    We estimate total as current page count (desktop app behavior).
    """
    try:
        fbt_client = get_fbt_client_for_store(store_id)
        success, combos, error = await list_combos(fbt_client, search, page, per_page)
        
        if not success:
            logger.error(f"Failed to list combos: {error}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=error or "Failed to list combos"
            )
        
        # Convert to response format - show all combos, even invalid ones
        combo_responses = []
        
        for combo in combos:
            try:
                combo_responses.append(ComboResponse(**combo))
            except Exception as e:
                # Still include invalid combos, but log warning
                combo_id = combo.get("main_id", combo.get("id", 0))
                logger.warning(f"Combo {combo_id}: Schema validation failed: {str(e)}, but including anyway")
                # Try to create response with minimal validation
                try:
                    # Use model_validate with from_attributes to be more lenient
                    combo_responses.append(ComboResponse.model_validate(combo, strict=False))
                except Exception as e2:
                    # If still fails, create a minimal response manually
                    combo_responses.append(ComboResponse(
                        main_id=combo_id,
                        main_name=combo.get("main_name"),
                        enabled=combo.get("enabled", True),
                        apply_scope=combo.get("apply_scope", "main_only"),
                        product_ids=combo.get("product_ids", [combo_id]) if combo.get("product_ids") else [combo_id],
                        main_ids=combo.get("main_ids", [combo_id]) if combo.get("main_ids") else [combo_id],
                        priority=combo.get("priority", 0),
                        discount_rules=combo.get("discount_rules", []),
                        combo_ids=combo.get("combo_ids", []),
                        updated_at=combo.get("updated_at")
                    ))
        
        # Desktop app doesn't return total, but backend needs it for pagination
        # Estimate total as current page count (conservative approach)
        total = len(combo_responses)
        
        return ComboListResponse(
            page=page,
            per_page=per_page,
            total=total,
            items=combo_responses,
            skipped_count=0,
            skipped_ids=None
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error listing combos for store {store_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error listing combos: {str(e)}"
        )


@router.get("/{main_id}", response_model=ComboResponse)
async def get_combo_endpoint(store_id: str, main_id: int):
    """
    Get combo details by main_id.
    Matching desktop app get_combo functionality.
    """
    try:
        fbt_client = get_fbt_client_for_store(store_id)
        success, combo_data, error = await get_combo(fbt_client, main_id)
        
        if not success:
            if "not found" in (error or "").lower():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=error or f"Combo with main_id {main_id} not found"
                )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=error or "Failed to get combo"
            )
        
        # Let Pydantic schema handle validation
        return ComboResponse(**combo_data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting combo: {str(e)}"
        )


@router.post("", response_model=ComboResponse)
async def create_combo_endpoint(store_id: str, request: ComboCreateRequest):
    """
    Create a new combo.
    Matching desktop app save_combo functionality.
    Validation happens in ops.save_combo (matching desktop app controller.validate_combo)
    """
    try:
        fbt_client = get_fbt_client_for_store(store_id)
        
        # Convert request to dict
        combo_data = request.dict()
        
        # Ensure main_id is set (use first main_id or first product_id)
        if not combo_data.get("main_id"):
            if combo_data.get("main_ids"):
                combo_data["main_id"] = combo_data["main_ids"][0]
            elif combo_data.get("product_ids"):
                combo_data["main_id"] = combo_data["product_ids"][0]
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="main_id or main_ids or product_ids required"
                )
        
        # Save (validation and migration happen in ops.save_combo)
        success, error = await save_combo(fbt_client, combo_data)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error or "Failed to create combo"
            )
        
        # Get the created combo
        success, combo_data, error = await get_combo(fbt_client, combo_data["main_id"])
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=error or "Failed to retrieve created combo"
            )
        
        return ComboResponse(**combo_data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating combo: {str(e)}"
        )


@router.put("/{main_id}", response_model=ComboResponse)
async def update_combo_endpoint(store_id: str, main_id: int, request: ComboUpdateRequest):
    """
    Update an existing combo.
    Matching desktop app save_combo functionality.
    Validation happens in ops.save_combo (matching desktop app controller.validate_combo)
    """
    try:
        fbt_client = get_fbt_client_for_store(store_id)
        
        # Convert request to dict
        combo_data = request.dict()
        combo_data["main_id"] = main_id
        
        # Save (validation and migration happen in ops.save_combo)
        success, error = await save_combo(fbt_client, combo_data)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error or "Failed to update combo"
            )
        
        # Get the updated combo
        success, combo_data, error = await get_combo(fbt_client, main_id)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=error or "Failed to retrieve updated combo"
            )
        
        return ComboResponse(**combo_data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating combo: {str(e)}"
        )


@router.delete("/{main_id}")
async def delete_combo_endpoint(store_id: str, main_id: int):
    """
    Delete a combo by main_id.
    Matching desktop app delete_combo functionality.
    """
    try:
        fbt_client = get_fbt_client_for_store(store_id)
        success, error = await delete_combo(fbt_client, main_id)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=error or "Failed to delete combo"
            )
        
        return {"success": True, "message": f"Combo {main_id} deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting combo: {str(e)}"
        )


@router.post("/search-products", response_model=ProductSearchResponse)
async def search_products_endpoint(store_id: str, request: ProductSearchRequest):
    """
    Search products by name/SKU/ID.
    Matching desktop app ProductSearchClient.search_products functionality.
    """
    try:
        woo_client = get_woo_client_for_store(store_id)
        success, products, error, total = await search_products(
            woo_client, request.query, request.per_page, request.page
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=error or "Failed to search products"
            )
        
        from app.schemas.fbt_combos import ProductLiteSchema
        product_schemas = [ProductLiteSchema(**p) for p in products]
        
        return ProductSearchResponse(
            products=product_schemas,
            total=total
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error searching products: {str(e)}"
        )
    finally:
        try:
            await woo_client.close()
        except:
            pass


@router.post("/resolve", response_model=ComboResolveResponse)
async def resolve_recommendations_endpoint(store_id: str, request: ComboResolveRequest):
    """
    Resolve combo recommendations for a product.
    Matching desktop app README_SCOPE.md resolver logic.
    """
    try:
        fbt_client = get_fbt_client_for_store(store_id)
        success, recommendations, error = await resolve_recommendations(
            fbt_client, request.product_id
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=error or "Failed to resolve recommendations"
            )
        
        from app.schemas.fbt_combos import DiscountRuleSchema
        discount_rules = [
            DiscountRuleSchema(**rule) 
            for rule in recommendations.get("discount_rules", [])
        ]
        
        return ComboResolveResponse(
            combo_id=recommendations.get("combo_id"),
            recommended_product_ids=recommendations.get("recommended_product_ids", []),
            discount_rules=discount_rules
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error resolving recommendations: {str(e)}"
        )


@router.post("/test-connection")
async def test_connection_endpoint(store_id: str):
    """
    Test connection to FBT API.
    """
    try:
        fbt_client = get_fbt_client_for_store(store_id)
        success, message = await fbt_client.test_connection()
        
        return {
            "success": success,
            "message": message
        }
    except HTTPException:
        raise
    except Exception as e:
        return {
            "success": False,
            "message": f"Error testing connection: {str(e)}"
        }
