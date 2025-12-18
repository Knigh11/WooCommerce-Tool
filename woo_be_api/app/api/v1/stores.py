"""
Stores API endpoints.
"""

from fastapi import APIRouter, HTTPException, status
from typing import List

from app.config import (
    get_all_stores, 
    generate_store_id, 
    save_stores_config, 
    load_stores_config,
    get_active_store,
    set_active_store,
    validate_store_config
)
from app.schemas.stores import (
    StoreSummary, 
    StoreCreateRequest, 
    StoreUpdateRequest,
    StoreDetail
)
from app.deps import get_woo_client_for_store, get_wp_client_for_store

router = APIRouter()


@router.get("", response_model=List[StoreSummary])
async def list_stores():
    """
    List all stores (no secrets returned).
    """
    stores = get_all_stores()
    result = []
    
    for store_name, store_config in stores.items():
        store_id = generate_store_id(store_name)
        result.append(StoreSummary(
            id=store_id,
            name=store_name,
            store_url=store_config.get("store_url", ""),
            has_wc_keys=bool(store_config.get("consumer_key") and store_config.get("consumer_secret")),
            has_wp_creds=bool(store_config.get("wp_username") and store_config.get("wp_app_password"))
        ))
    
    return result


@router.get("/{store_id}", response_model=StoreDetail)
async def get_store(store_id: str):
    """
    Get store info.
    """
    from app.deps import get_store_by_id
    
    try:
        store = get_store_by_id(store_id)
        active_store = get_active_store()
        store_name = store.get("name")
        is_active = active_store == store_name
        
        return StoreDetail(
            id=store.get("id"),
            name=store.get("name"),
            store_url=store.get("store_url"),
            has_wc_keys=bool(store.get("consumer_key") and store.get("consumer_secret")),
            has_wp_creds=bool(store.get("wp_username") and store.get("wp_app_password")),
            is_active=is_active
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching store: {str(e)}"
        )


@router.post("/{store_id}/connect")
async def test_connection(store_id: str):
    """
    Test connection to WooCommerce and WordPress APIs.
    Uses shorter timeout for faster response.
    """
    import asyncio
    
    client = get_woo_client_for_store(store_id)
    
    result = {
        "success": False,
        "message": "",
        "woocommerce": {"ok": False, "message": ""},
        "wordpress": {"ok": False, "message": ""}
    }
    
    try:
        # Test WooCommerce with timeout
        try:
            wc_ok, wc_msg = await asyncio.wait_for(
                client.test_connection(),
                timeout=10.0  # 10s timeout for connection test
            )
            result["woocommerce"] = {"ok": wc_ok, "message": wc_msg}
        except asyncio.TimeoutError:
            result["woocommerce"] = {"ok": False, "message": "Connection test timeout (10s)"}
        except Exception as e:
            result["woocommerce"] = {"ok": False, "message": f"Error: {str(e)}"}
        
        # Test WordPress (optional) with timeout
        try:
            wp_client = get_wp_client_for_store(store_id)
            wp_ok, wp_msg = await asyncio.wait_for(
                wp_client.test_connection(),
                timeout=10.0  # 10s timeout
            )
            result["wordpress"] = {"ok": wp_ok, "message": wp_msg}
            await wp_client.close()
        except asyncio.TimeoutError:
            result["wordpress"] = {"ok": False, "message": "Connection test timeout (10s)"}
        except Exception as e:
            result["wordpress"] = {"ok": False, "message": f"WordPress client not available: {str(e)}"}
        
        # Overall success
        result["success"] = result["woocommerce"]["ok"]
        result["message"] = "Kết nối thành công!" if result["success"] else "Kết nối thất bại"
        
        return result
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error testing connection: {str(e)}"
        )
    finally:
        await client.close()


@router.post("", response_model=StoreDetail)
async def create_store(request: StoreCreateRequest):
    """
    Create a new store configuration.
    """
    try:
        # Load current config
        config = load_stores_config()
        stores = config.get("stores", {})
        
        # Check if store name already exists
        if request.name in stores:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Store with name '{request.name}' already exists"
            )
        
        # Create store config
        store_config = {
            "store_url": request.store_url.strip(),
            "consumer_key": request.consumer_key.strip(),
            "consumer_secret": request.consumer_secret.strip(),
        }
        
        if request.wp_username:
            store_config["wp_username"] = request.wp_username.strip()
        if request.wp_app_password:
            store_config["wp_app_password"] = request.wp_app_password.strip()
        
        # Validate config (giống desktop app)
        is_valid, err_msg = validate_store_config(store_config)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Config không hợp lệ: {err_msg}"
            )
        
        # Add to stores
        stores[request.name] = store_config
        config["stores"] = stores
        
        # Set as active if requested
        if request.set_as_active:
            config["active"] = request.name
        
        # Save config
        save_stores_config(config)
        
        # Return created store
        store_id = generate_store_id(request.name)
        active_store = get_active_store()
        is_active = active_store == request.name
        
        return StoreDetail(
            id=store_id,
            name=request.name,
            store_url=store_config["store_url"],
            has_wc_keys=True,
            has_wp_creds=bool(store_config.get("wp_username") and store_config.get("wp_app_password")),
            is_active=is_active
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating store: {str(e)}"
        )


@router.put("/{store_id}", response_model=StoreDetail)
async def update_store(store_id: str, request: StoreUpdateRequest):
    """
    Update an existing store configuration.
    """
    from app.deps import get_store_by_id
    
    try:
        # Get store by ID to find the name
        store = get_store_by_id(store_id)
        store_name = store.get("name")
        
        # Load current config
        config = load_stores_config()
        stores = config.get("stores", {})
        
        if store_name not in stores:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Store '{store_name}' not found"
            )
        
        # Get current store config
        store_config = stores[store_name].copy()
        
        # Update fields if provided
        if request.name is not None and request.name != store_name:
            # Check if new name already exists
            if request.name in stores:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Store with name '{request.name}' already exists"
                )
            
            # Remove old entry and create new one with new name
            del stores[store_name]
            store_name = request.name
            
            # Update active store name if this was the active store
            if config.get("active") == store.get("name"):
                config["active"] = request.name
        
        if request.store_url is not None:
            store_config["store_url"] = request.store_url.strip()
        if request.consumer_key is not None:
            store_config["consumer_key"] = request.consumer_key.strip()
        if request.consumer_secret is not None:
            store_config["consumer_secret"] = request.consumer_secret.strip()
        if request.wp_username is not None:
            if request.wp_username:
                store_config["wp_username"] = request.wp_username.strip()
            else:
                store_config.pop("wp_username", None)
        if request.wp_app_password is not None:
            if request.wp_app_password:
                store_config["wp_app_password"] = request.wp_app_password.strip()
            else:
                store_config.pop("wp_app_password", None)
        
        # Validate config (giống desktop app)
        is_valid, err_msg = validate_store_config(store_config)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Config không hợp lệ: {err_msg}"
            )
        
        # Update stores dict
        stores[store_name] = store_config
        config["stores"] = stores
        
        # Save config
        save_stores_config(config)
        
        # Return updated store
        new_store_id = generate_store_id(store_name)
        active_store = get_active_store()
        is_active = active_store == store_name
        
        return StoreDetail(
            id=new_store_id,
            name=store_name,
            store_url=store_config["store_url"],
            has_wc_keys=bool(store_config.get("consumer_key") and store_config.get("consumer_secret")),
            has_wp_creds=bool(store_config.get("wp_username") and store_config.get("wp_app_password")),
            is_active=is_active
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating store: {str(e)}"
        )


@router.delete("/{store_id}")
async def delete_store(store_id: str):
    """
    Delete a store configuration.
    """
    from app.deps import get_store_by_id
    
    try:
        # Get store by ID to find the name
        store = get_store_by_id(store_id)
        store_name = store.get("name")
        
        # Load current config
        config = load_stores_config()
        stores = config.get("stores", {})
        
        if store_name not in stores:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Store '{store_name}' not found"
            )
        
        # Check if this is the active store
        active_store = config.get("active")
        if active_store == store_name:
            # Nếu xóa active store, chọn store đầu tiên làm active (giống desktop app)
            remaining_stores = [name for name in stores.keys() if name != store_name]
            if remaining_stores:
                config["active"] = remaining_stores[0]
            else:
                # Không còn store nào, clear active
                config["active"] = ""
        
        # Remove store
        del stores[store_name]
        config["stores"] = stores
        
        # Save config
        save_stores_config(config)
        
        return {"success": True, "message": f"Store '{store_name}' deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting store: {str(e)}"
        )


@router.post("/{store_id}/set-active")
async def set_active_store_endpoint(store_id: str):
    """
    Set a store as the active store.
    """
    from app.deps import get_store_by_id
    
    try:
        # Get store by ID to find the name
        store = get_store_by_id(store_id)
        store_name = store.get("name")
        
        # Set as active
        set_active_store(store_name)
        
        return {"success": True, "message": f"Store '{store_name}' set as active"}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error setting active store: {str(e)}"
        )

