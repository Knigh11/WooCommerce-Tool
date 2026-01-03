"""
BMSM (Buy More Save More) API endpoints.
Matching desktop app functionality.
"""

from fastapi import APIRouter, HTTPException, status, Query
from typing import Optional

from app.deps import get_woo_client_for_store, get_wp_client_for_store
from app.core.woo_client import WooClient
from app.core.bmsm_client import BmsmIndexClient
from app.core.ops.bmsm import (
    get_product_rules, save_product_rules, search_products,
    get_inventory_index, get_all_inventory_index, build_inventory_summary
)
from app.schemas.bmsm import (
    ProductSearchRequest, ProductSearchResponse,
    ProductRulesResponse, ProductRulesUpdateRequest,
    InventoryIndexRequest, InventoryIndexResponse,
    BMSMRulesSchema
)

router = APIRouter()


def get_bmsm_index_client_for_store(store_id: str) -> BmsmIndexClient:
    """
    Get BMSM index client for a store.
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
            detail="WordPress credentials not configured. BMSM Index API requires WP username and app password."
        )
    
    return BmsmIndexClient(store_url, wp_username, wp_app_password)


@router.post("/search-products", response_model=ProductSearchResponse)
async def search_products_endpoint(store_id: str, request: ProductSearchRequest):
    """
    Search products by keyword/SKU/ID.
    Matching desktop app ProductApiClient.search_products functionality.
    """
    try:
        woo_client = get_woo_client_for_store(store_id)
        success, products, error, total = await search_products(
            woo_client, request.query, request.page, request.per_page, request.fields
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=error or "Failed to search products"
            )
        
        return ProductSearchResponse(
            products=products,
            total=total,
            page=request.page,
            per_page=request.per_page
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


@router.get("/products/{product_id}/rules", response_model=ProductRulesResponse)
async def get_product_rules_endpoint(store_id: str, product_id: int):
    """
    Get BMSM rules for a product.
    Matching desktop app controller.load_product_rules functionality.
    """
    try:
        woo_client = get_woo_client_for_store(store_id)
        success, rules_dict, product_name, error = await get_product_rules(woo_client, product_id)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=error or "Failed to get product rules"
            )
        
        if rules_dict is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product {product_id} not found"
            )
        
        # Convert to schema
        rules_schema = BMSMRulesSchema(**rules_dict)
        
        return ProductRulesResponse(
            product_id=product_id,
            product_name=product_name or f"Product #{product_id}",
            rules=rules_schema
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting product rules: {str(e)}"
        )
    finally:
        try:
            await woo_client.close()
        except:
            pass


@router.put("/products/{product_id}/rules", response_model=ProductRulesResponse)
async def update_product_rules_endpoint(
    store_id: str, 
    product_id: int, 
    request: ProductRulesUpdateRequest
):
    """
    Update BMSM rules for a product.
    Matching desktop app controller.save_product_rules functionality.
    """
    try:
        woo_client = get_woo_client_for_store(store_id)
        success, updated_product, error = await save_product_rules(
            woo_client, product_id, request.rules
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error or "Failed to update product rules"
            )
        
        # Get updated rules
        success, rules_dict, product_name, error = await get_product_rules(woo_client, product_id)
        
        if not success or rules_dict is None:
            # Fallback: use request rules
            rules_schema = request.rules
            product_name = updated_product.get("name", f"Product #{product_id}") if updated_product else f"Product #{product_id}"
        else:
            rules_schema = BMSMRulesSchema(**rules_dict)
            product_name = product_name or f"Product #{product_id}"
        
        return ProductRulesResponse(
            product_id=product_id,
            product_name=product_name,
            rules=rules_schema
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating product rules: {str(e)}"
        )
    finally:
        try:
            await woo_client.close()
        except:
            pass


@router.post("/products/{product_id}/rules/disable")
async def disable_product_rules_endpoint(store_id: str, product_id: int):
    """
    Disable BMSM for a product (set enabled to false, preserve rules).
    Matching desktop app controller.disable_product_rules functionality.
    """
    try:
        woo_client = get_woo_client_for_store(store_id)
        
        # Get current rules
        success, rules_dict, product_name, error = await get_product_rules(woo_client, product_id)
        
        if not success or rules_dict is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error or f"Product {product_id} not found"
            )
        
        # Disable but preserve rules
        rules_dict["enabled"] = False
        rules_schema = BMSMRulesSchema(**rules_dict)
        
        # Save
        success, updated_product, error = await save_product_rules(
            woo_client, product_id, rules_schema
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error or "Failed to disable product rules"
            )
        
        return {
            "success": True,
            "message": f"BMSM disabled for product {product_id}"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error disabling product rules: {str(e)}"
        )
    finally:
        try:
            await woo_client.close()
        except:
            pass


@router.delete("/products/{product_id}/rules")
async def clear_product_rules_endpoint(store_id: str, product_id: int):
    """
    Clear BMSM rules for a product (set enabled to false and clear rules).
    Matching desktop app controller.clear_product_rules functionality.
    """
    try:
        woo_client = get_woo_client_for_store(store_id)
        
        # Create empty rules
        empty_rules = BMSMRulesSchema(enabled=False, rules=[])
        
        # Save
        success, updated_product, error = await save_product_rules(
            woo_client, product_id, empty_rules
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error or "Failed to clear product rules"
            )
        
        return {
            "success": True,
            "message": f"BMSM rules cleared for product {product_id}"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error clearing product rules: {str(e)}"
        )
    finally:
        try:
            await woo_client.close()
        except:
            pass


@router.get("/inventory/all", response_model=InventoryIndexResponse)
async def get_all_inventory_index_endpoint(
    store_id: str,
    search: str = Query("", description="Search query"),
    filter_type: str = Query("all", description="Filter type: all, enabled, disabled_with_rules, invalid, with_rules, no_rules")
):
    """
    Get ALL BMSM inventory index (no pagination, fetches all pages).
    Returns all products with BMSM configured.
    """
    try:
        index_client = get_bmsm_index_client_for_store(store_id)
        success, inventory_rows, error = await get_all_inventory_index(
            index_client,
            search,
            filter_type
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=error or "Failed to load all inventory index"
            )
        
        # Build summary
        summary = build_inventory_summary(inventory_rows)
        
        from app.schemas.bmsm import InventoryRowSchema
        row_schemas = [InventoryRowSchema(**row) for row in inventory_rows]
        
        return InventoryIndexResponse(
            page=1,
            per_page=len(row_schemas),
            total=len(row_schemas),
            items=row_schemas,
            summary=summary
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error loading all inventory index: {str(e)}"
        )


@router.post("/inventory", response_model=InventoryIndexResponse)
async def get_inventory_index_endpoint(store_id: str, request: InventoryIndexRequest):
    """
    Get BMSM inventory index (products with BMSM configured) with pagination.
    Matching desktop app inventory_service.load_index functionality.
    """
    try:
        index_client = get_bmsm_index_client_for_store(store_id)
        success, inventory_rows, total, error = await get_inventory_index(
            index_client,
            request.page,
            request.per_page,
            request.search,
            request.filter_type
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=error or "Failed to load inventory index"
            )
        
        # Build summary
        summary = build_inventory_summary(inventory_rows)
        
        from app.schemas.bmsm import InventoryRowSchema
        row_schemas = [InventoryRowSchema(**row) for row in inventory_rows]
        
        return InventoryIndexResponse(
            page=request.page,
            per_page=request.per_page,
            total=total,
            items=row_schemas,
            summary=summary
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error loading inventory index: {str(e)}"
        )


@router.post("/test-connection")
async def test_connection_endpoint(store_id: str):
    """
    Test connection to BMSM Index API.
    """
    try:
        index_client = get_bmsm_index_client_for_store(store_id)
        success, message = await index_client.test_connection()
        
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

