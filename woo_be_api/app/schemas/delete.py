"""
Delete products request schemas.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Literal


class DeleteOptions(BaseModel):
    """Delete products job options."""
    delete_media: bool = Field(default=True, description="Delete media files via WP API")
    dry_run: bool = Field(default=False, description="Dry run mode (don't actually delete)")
    verbose: bool = Field(default=False, description="Verbose logging")
    parallel_media: bool = Field(default=False, description="Delete media in parallel (faster but higher server load)")
    batch_size: int = Field(default=20, ge=1, le=100, description="Batch size for deletion")
    stream_batch_size: int = Field(default=100, ge=50, le=500, description="Batch size for streaming mode")
    protection_mode: Literal["auto", "manual"] = Field(default="auto", description="Server protection mode")
    protection_preset: Literal["conservative", "moderate", "aggressive"] = Field(
        default="moderate",
        description="Protection preset (only used when protection_mode=manual)"
    )


class DeleteProductsRequest(BaseModel):
    """Delete products job request matching desktop app schema."""
    mode: Literal["urls", "categories", "all", "streaming"] = Field(..., description="Delete mode")
    urls: Optional[List[str]] = Field(None, description="Product URLs (required if mode=urls)")
    category_ids: Optional[List[int]] = Field(None, description="Category IDs (required if mode=categories)")
    options: DeleteOptions = Field(default_factory=DeleteOptions, description="Job options")

