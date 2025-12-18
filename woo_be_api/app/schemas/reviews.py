"""
Schemas for reviews operations.
"""

from typing import Optional, List, Dict
from pydantic import BaseModel, Field


class ReviewCreateRequest(BaseModel):
    """Request to create a review."""
    product_id: int = Field(..., description="Product ID")
    reviewer: str = Field(..., description="Reviewer name")
    reviewer_email: str = Field(..., description="Reviewer email")
    rating: int = Field(..., ge=1, le=5, description="Rating (1-5)")
    review_text: str = Field(..., description="Review text")
    image_urls: Optional[List[str]] = Field(default=None, description="Image URLs to upload with review")


class ReviewResponse(BaseModel):
    """Review response."""
    id: int
    product_id: int
    product_name: str
    reviewer: str
    reviewer_email: str
    rating: int
    review_text: str
    status: str
    date_created: Optional[str] = None
    images: Optional[List[Dict]] = None


class ReviewsByURLRequest(BaseModel):
    """Request to fetch product and reviews by URL."""
    urls: List[str] = Field(..., description="List of product URLs")

