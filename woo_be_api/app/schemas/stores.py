"""
Store-related schemas.
"""

from pydantic import BaseModel, Field
from typing import Optional


class StoreSummary(BaseModel):
    """Store summary (no secrets)."""
    id: str
    name: str
    store_url: str
    has_wc_keys: bool
    has_wp_creds: bool


class StoreCreateRequest(BaseModel):
    """Request to create a new store."""
    name: str = Field(..., description="Store display name")
    store_url: str = Field(..., description="Store URL")
    consumer_key: str = Field(..., description="WooCommerce Consumer Key")
    consumer_secret: str = Field(..., description="WooCommerce Consumer Secret")
    wp_username: Optional[str] = Field(None, description="WordPress username (optional)")
    wp_app_password: Optional[str] = Field(None, description="WordPress App Password (optional)")
    set_as_active: bool = Field(False, description="Set this store as active after creation")


class StoreUpdateRequest(BaseModel):
    """Request to update an existing store."""
    name: Optional[str] = Field(None, description="Store display name")
    store_url: Optional[str] = Field(None, description="Store URL")
    consumer_key: Optional[str] = Field(None, description="WooCommerce Consumer Key")
    consumer_secret: Optional[str] = Field(None, description="WooCommerce Consumer Secret")
    wp_username: Optional[str] = Field(None, description="WordPress username")
    wp_app_password: Optional[str] = Field(None, description="WordPress App Password")


class StoreDetail(BaseModel):
    """Store detail (includes all fields except secrets are masked)."""
    id: str
    name: str
    store_url: str
    has_wc_keys: bool
    has_wp_creds: bool
    is_active: bool

