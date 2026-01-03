"""
Feed generation schemas.
"""

from pydantic import BaseModel
from typing import Optional, List, Literal
from datetime import datetime


class FeedFilters(BaseModel):
    """Product filters for feed generation."""
    category_id: Optional[int] = None
    after_date: Optional[datetime] = None
    product_limit: Optional[int] = None
    product_ids: Optional[List[int]] = None


class FeedDefaults(BaseModel):
    """Default values for feed items."""
    google_category: Optional[str] = None
    product_type: Optional[str] = None
    gender: Optional[str] = None
    age_group: Optional[str] = None


class SheetsConfig(BaseModel):
    """Google Sheets export configuration."""
    sheet_id: Optional[str] = None
    tab_name: Optional[str] = None
    credentials_json_base64: Optional[str] = None


class FeedExportOptions(BaseModel):
    """Export format options."""
    xml: bool = True
    sheets: bool = False
    sheets_config: Optional[SheetsConfig] = None


class FeedJobCreate(BaseModel):
    """Create feed generation job request."""
    channel: Literal["gmc", "bing", "both"]
    filters: FeedFilters
    defaults: FeedDefaults
    export: FeedExportOptions


class FeedJobResponse(BaseModel):
    """Feed job creation response."""
    job_id: str
    status: str = "queued"
    sse_url: str
    download_url: str
    token: Optional[str] = None  # Job token for SSE access


class FeedJobSummary(BaseModel):
    """Feed job summary for list endpoint."""
    job_id: str
    status: str
    created_at: Optional[str] = None
    finished_at: Optional[str] = None
    channel: Optional[str] = None
    filename: Optional[str] = None
    size: Optional[int] = None


class FeedJobListResponse(BaseModel):
    """Response for list feed jobs."""
    items: List[FeedJobSummary]

