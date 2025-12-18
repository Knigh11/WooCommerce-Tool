"""
Schemas for CSV import operations.
"""

from typing import Optional
from pydantic import BaseModel, Field


class CSVImportRequest(BaseModel):
    """Request for CSV import."""
    csv_content: str = Field(..., description="CSV file content (base64 encoded or plain text)")
    category_id: Optional[int] = Field(default=None, description="Category ID for imported products")
    tag: Optional[str] = Field(default=None, description="Product tag (optional)")
    options: dict = Field(default_factory=dict, description="Import options")

