"""
Product-related schemas.
"""

from pydantic import BaseModel
from typing import Optional, List, Dict, Any


class ImageInfo(BaseModel):
    """Normalized image information."""
    mode: str  # "wp", "fifu", or "none"
    original: str
    thumb: str
    attachment_id: Optional[int] = None
    fifu_url: Optional[str] = None
    alt: Optional[str] = None


class ProductSummary(BaseModel):
    """Product summary for list view."""
    id: int
    name: str
    type: str
    status: str
    price: Optional[str] = None
    stock_status: Optional[str] = None
    variations_count: Optional[int] = None
    image: ImageInfo


class ProductDetail(BaseModel):
    """Product detail for single product view."""
    id: int
    name: str
    type: str
    status: str
    sku: Optional[str] = None
    price: Optional[str] = None
    regular_price: Optional[str] = None
    sale_price: Optional[str] = None
    stock_status: Optional[str] = None
    stock_quantity: Optional[int] = None
    short_description: Optional[str] = None
    description: Optional[str] = None
    image: ImageInfo
    gallery: List[ImageInfo] = []
    meta_data: Optional[List[Dict[str, Any]]] = None


class ProductListResponse(BaseModel):
    """Product list response."""
    page: int
    per_page: int
    total: Optional[int] = None
    items: List[ProductSummary]

