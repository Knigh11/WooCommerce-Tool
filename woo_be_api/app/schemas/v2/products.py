"""
V2 Product schemas - ProductCard for display.
"""

from pydantic import BaseModel, Field
from typing import Optional, Literal


class ProductCard(BaseModel):
    """Product card with image and title for display"""
    id: int
    type: Literal["simple", "variable"] = "simple"
    title: str
    image_url: Optional[str] = None
    sku: Optional[str] = None
    price: Optional[str] = None  # String for display
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": 123,
                "type": "simple",
                "title": "Product Name",
                "image_url": "https://example.com/image.jpg",
                "sku": "SKU123",
                "price": "99.99"
            }
        }


class ProductCardListResponse(BaseModel):
    """List of product cards"""
    items: list[ProductCard]
    
    class Config:
        json_schema_extra = {
            "example": {
                "items": []
            }
        }

