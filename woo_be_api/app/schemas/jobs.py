"""
Job-related schemas.
"""

from pydantic import BaseModel
from typing import Optional, List, Dict, Any, Literal


class JobScope(BaseModel):
    """Job scope definition."""
    product_ids: Optional[List[int]] = None
    category_ids: Optional[List[int]] = None
    search: Optional[str] = None


class JobOptions(BaseModel):
    """Common job options."""
    dry_run: bool = False
    batch_size: int = 25
    rate_limit_rps: float = 5.0
    max_retries: int = 5


class DeleteProductsRequest(BaseModel):
    """Delete products job request."""
    scope: JobScope
    options: JobOptions = JobOptions()


class PriceRule(BaseModel):
    """Price update rule."""
    op: Literal["increase", "decrease"]
    type: Literal["percent", "fixed"]
    value: float


class UpdatePricesOptions(JobOptions):
    """Update prices job options."""
    apply_to_variations: bool = True


class UpdatePricesRequest(BaseModel):
    """Update prices job request."""
    scope: JobScope
    rule: PriceRule
    options: UpdatePricesOptions = UpdatePricesOptions()


class BulkUpdateFieldsRequest(BaseModel):
    """Bulk update fields job request."""
    scope: JobScope
    patch: Dict[str, str]  # title_prefix, title_suffix, short_description, description
    options: JobOptions = JobOptions()


class JobProgress(BaseModel):
    """Job progress information."""
    done: int
    total: int
    percent: int


class JobMetrics(BaseModel):
    """Job metrics."""
    success: int = 0
    failed: int = 0
    retried: int = 0
    skipped: int = 0


class JobCurrent(BaseModel):
    """Current item being processed."""
    product_id: Optional[int] = None
    action: Optional[str] = None


class JobResponse(BaseModel):
    """Job status response."""
    job_id: str
    status: str  # queued, running, done, failed, cancelled
    progress: Optional[JobProgress] = None
    metrics: Optional[JobMetrics] = None
    current: Optional[JobCurrent] = None
    started_at: Optional[str] = None
    updated_at: Optional[str] = None


class JobCreateResponse(BaseModel):
    """Job creation response."""
    job_id: str
    status: str = "queued"

