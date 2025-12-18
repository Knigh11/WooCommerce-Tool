"""
Schemas for product editor operations.
"""

from typing import Optional, List, Dict
from pydantic import BaseModel, Field


class EditableImageSchema(BaseModel):
    """Editable image schema."""
    id: Optional[int] = None
    src: str
    alt: str = ""
    position: int = 0
    delete_from_media: bool = False


class EditableAttributeSchema(BaseModel):
    """Editable attribute schema."""
    name: str
    slug: str
    options: List[str] = Field(default_factory=list)
    original_data: Optional[Dict] = None


class EditableVariationSchema(BaseModel):
    """Editable variation schema."""
    id: Optional[int] = None
    sku: str = ""
    attributes: Dict[str, str] = Field(default_factory=dict)
    regular_price: str = ""
    sale_price: str = ""
    image_id: Optional[int] = None
    image_src: Optional[str] = None
    status: str = "existing"  # "existing", "new", "modified", "to_delete"


class EditableProductSchema(BaseModel):
    """Editable product schema."""
    id: int
    slug: str
    name: str
    short_description: str = ""
    description: str = ""
    attributes: List[EditableAttributeSchema] = Field(default_factory=list)
    images: List[EditableImageSchema] = Field(default_factory=list)
    variations: List[EditableVariationSchema] = Field(default_factory=list)
    images_to_delete_media_ids: List[int] = Field(default_factory=list)


class ProductUpdateRequest(BaseModel):
    """Request to update product details."""
    name: Optional[str] = None
    short_description: Optional[str] = None
    description: Optional[str] = None
    attributes: Optional[List[EditableAttributeSchema]] = None
    images: Optional[List[EditableImageSchema]] = None
    variations: Optional[List[EditableVariationSchema]] = None
    images_to_delete_media_ids: Optional[List[int]] = None
