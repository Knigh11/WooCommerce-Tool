"""
Price update request schemas.
"""

from pydantic import BaseModel, Field
from typing import Optional, Literal


class PriceUpdateOptions(BaseModel):
    """Price update job options."""
    batch_size: int = Field(default=30, ge=1, le=100, description="Batch size for updates")
    max_retries: int = Field(default=4, ge=0, le=10, description="Maximum retry attempts")
    delay_between_batches: float = Field(default=0.2, ge=0.0, le=5.0, description="Delay between batches in seconds")


class PriceUpdateRequest(BaseModel):
    """Price update job request matching desktop app schema."""
    category_id: Optional[int] = Field(None, description="Category ID (null = all categories)")
    adjustment_type: Literal["increase", "decrease"] = Field(..., description="Increase or decrease prices")
    adjustment_mode: Literal["amount", "percent"] = Field(..., description="Adjustment mode: amount or percent")
    adjustment_value: float = Field(..., gt=0, description="Adjustment value (amount or percentage)")
    options: PriceUpdateOptions = Field(default_factory=PriceUpdateOptions, description="Job options")

