"""
Category schemas.
"""

from pydantic import BaseModel
from typing import List, Dict, Optional, Literal


class CategoryNode(BaseModel):
    """Category node in tree structure."""
    id: int
    name: str
    parent: int
    count: int = 0
    level: int = 0
    full_path: str = ""
    image_id: Optional[int] = None
    image_src: Optional[str] = None
    slug: str = ""
    description: str = ""
    children: List["CategoryNode"] = []

    class Config:
        json_encoders = {
            # Handle recursive structure
        }


class CategoriesResponse(BaseModel):
    """Categories response with tree structure."""
    raw_categories: List[Dict]
    tree: List[CategoryNode]
    flattened: List[CategoryNode]


class CategoryResponse(BaseModel):
    """Single category response."""
    id: int
    name: str
    slug: str
    parent: int
    description: str = ""
    count: int = 0
    image: Optional[Dict] = None


class CategoryCreateRequest(BaseModel):
    """Create category request."""
    name: str
    slug: Optional[str] = None
    parent: int = 0
    description: str = ""
    image_id: Optional[int] = None


class CategoryUpdateRequest(BaseModel):
    """Update category request."""
    name: Optional[str] = None
    slug: Optional[str] = None
    parent: Optional[int] = None
    description: Optional[str] = None
    image_id: Optional[int] = None


class BulkCategoryActionRequest(BaseModel):
    """Bulk category action request."""
    action: Literal["delete", "change_parent", "update"]
    category_ids: List[int]
    params: Optional[Dict] = None  # For change_parent: {"new_parent_id": int}

