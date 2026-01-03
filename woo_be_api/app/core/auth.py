"""
Store authentication and token utilities.
"""

import secrets
from typing import Dict, Optional
from fastapi import HTTPException, status, Header
from app.deps import get_store_by_id


def generate_token(length: int = 32) -> str:
    """
    Generate a secure random token.
    
    Args:
        length: Token length in bytes (will be hex-encoded, so final length is 2x)
    
    Returns:
        Hex-encoded random token string
    """
    return secrets.token_hex(length)


async def verify_store_key(store_id: str, store_key: Optional[str] = None) -> Dict:
    """
    Verify store_id and X-Store-Key header match store configuration.
    
    Args:
        store_id: Store ID from path
        store_key: Store API key from X-Store-Key header
    
    Returns:
        Store config dict
    
    Raises:
        HTTPException: If key is missing, invalid, or doesn't match store
    """
    if not store_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing X-Store-Key header",
            headers={"X-Error-Code": "missing_store_key"}
        )
    
    try:
        store = get_store_by_id(store_id)
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Store '{store_id}' not found"
        )
    
    # Get API key from store config (support backward compatibility)
    store_api_key = store.get("api_key") or store.get("store_api_key") or store.get("storeKey")
    
    if not store_api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Store '{store_id}' does not have an API key configured. Please generate one.",
            headers={"X-Error-Code": "missing_store_key"}
        )
    
    # Constant-time comparison to prevent timing attacks
    if not secrets.compare_digest(store_key, store_api_key):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid X-Store-Key",
            headers={"X-Error-Code": "invalid_store_key"}
        )
    
    return store


async def get_verified_store(
    store_id: str,
    x_store_key: Optional[str] = Header(None, alias="X-Store-Key")
) -> Dict:
    """
    FastAPI dependency to verify store authentication.
    
    Usage:
        @router.get("/endpoint")
        async def my_endpoint(store: Dict = Depends(get_verified_store)):
            ...
    """
    return await verify_store_key(store_id, x_store_key)

