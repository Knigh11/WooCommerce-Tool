"""
Dependency injection for FastAPI.
"""

from typing import Dict, Optional
import redis.asyncio as aioredis
from fastapi import HTTPException, status

from app.config import get_settings, get_all_stores, generate_store_id, get_store_config
from app.core.woo_client import WooClient
from app.core.wp_client import WPClient


# Lazy load settings to avoid blocking on startup
_settings = None

def _get_settings():
    """Lazy get settings."""
    global _settings
    if _settings is None:
        _settings = get_settings()
    return _settings
_redis_client: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    """Get Redis client (singleton) with lazy connection."""
    global _redis_client
    if _redis_client is None:
        settings = _get_settings()
        _redis_client = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=1.0,  # 1s timeout for connection (faster)
            socket_timeout=3.0,  # 3s timeout for operations
            retry_on_timeout=True,
            health_check_interval=30,  # Check connection health every 30s
            # Don't block on connection - let it connect lazily
            socket_keepalive=True,
            socket_keepalive_options={}
        )
        # Don't test connection on startup - let it connect lazily on first use
        # This makes startup faster
    return _redis_client


async def close_redis():
    """Close Redis connection."""
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None


def get_store_by_id(store_id: str) -> Dict:
    """
    Get store configuration by store_id.
    
    Args:
        store_id: Store ID (slug).
    
    Returns:
        Store config dict.
    
    Raises:
        HTTPException: If store not found.
    """
    stores = get_all_stores()
    
    # Try to find by matching generated store_id
    for store_name, store_config in stores.items():
        if generate_store_id(store_name) == store_id:
            return {
                "name": store_name,
                "id": store_id,
                **store_config
            }
    
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Store '{store_id}' not found"
    )


def get_woo_client_for_store(store_id: str) -> WooClient:
    """
    Create WooClient for a store.
    
    Args:
        store_id: Store ID.
    
    Returns:
        WooClient instance.
    
    Raises:
        HTTPException: If store not found or missing credentials.
    """
    store = get_store_by_id(store_id)
    
    store_url = store.get("store_url")
    consumer_key = store.get("consumer_key")
    consumer_secret = store.get("consumer_secret")
    wp_username = store.get("wp_username")
    wp_app_password = store.get("wp_app_password")
    
    if not store_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Store URL not configured"
        )
    
    # Prefer WooCommerce API credentials
    if consumer_key and consumer_secret:
        return WooClient(
            store_url=store_url,
            consumer_key=consumer_key,
            consumer_secret=consumer_secret
        )
    
    # Fallback to WP application password
    if wp_username and wp_app_password:
        return WooClient(
            store_url=store_url,
            wp_username=wp_username,
            wp_app_password=wp_app_password
        )
    
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Store credentials not configured (need consumer_key/secret or wp_username/app_password)"
    )


def get_wp_client_for_store(store_id: str) -> WPClient:
    """
    Create WPClient for a store.
    
    Args:
        store_id: Store ID.
    
    Returns:
        WPClient instance.
    
    Raises:
        HTTPException: If store not found or missing WP credentials.
    """
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
            detail="WordPress credentials not configured (need wp_username and wp_app_password)"
        )
    
    return WPClient(
        store_url=store_url,
        username=wp_username,
        app_password=wp_app_password
    )

