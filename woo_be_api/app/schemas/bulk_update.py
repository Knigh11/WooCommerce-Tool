"""
Schemas for bulk product update operations.
"""

from typing import Optional, List
from pydantic import BaseModel, Field


class BulkUpdateOptions(BaseModel):
    """Options for bulk update operations."""
    dry_run: bool = Field(default=False, description="Preview changes without applying")
    batch_size: int = Field(default=10, ge=1, le=50, description="Products per batch")
    max_workers: int = Field(default=3, ge=1, le=10, description="Concurrent workers")
    delay_between_batches: float = Field(default=0.5, ge=0, le=5, description="Delay between batches (seconds)")
    max_retries: int = Field(default=3, ge=0, le=10, description="Max retries per product")
    base_retry_delay: float = Field(default=1.0, ge=0, description="Base retry delay (seconds)")
    max_retry_delay: float = Field(default=10.0, ge=0, description="Max retry delay (seconds)")


class BulkUpdateRequest(BaseModel):
    """Request for bulk product update."""
    # Product selection
    mode: str = Field(..., description="Selection mode: 'urls' or 'categories'")
    urls: Optional[List[str]] = Field(default=None, description="Product URLs (required if mode='urls')")
    category_ids: Optional[List[int]] = Field(default=None, description="Category IDs (required if mode='categories')")
    
    # Title update
    update_title: bool = Field(default=False, description="Enable title update")
    prefix: Optional[str] = Field(default=None, description="Title prefix")
    suffix: Optional[str] = Field(default=None, description="Title suffix")
    avoid_duplicate_title: bool = Field(default=True, description="Avoid adding duplicate prefix/suffix")
    
    # Short description update
    update_short_description: bool = Field(default=False, description="Enable short description update")
    short_template: Optional[str] = Field(default=None, description="Short description template with placeholders")
    
    # Description update
    update_description: bool = Field(default=False, description="Enable description update")
    description_mode: str = Field(default="append", description="Mode: 'replace', 'append', or 'prepend'")
    description_template: Optional[str] = Field(default=None, description="Description template with placeholders")
    use_marker_for_description: bool = Field(default=True, description="Use marker blocks to avoid double appending")
    
    # Options
    options: BulkUpdateOptions = Field(default_factory=BulkUpdateOptions)

