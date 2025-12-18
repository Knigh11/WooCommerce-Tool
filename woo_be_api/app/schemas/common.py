"""
Common schemas.
"""

from pydantic import BaseModel
from typing import Optional


class HealthResponse(BaseModel):
    """Health check response."""
    ok: bool = True


class ErrorResponse(BaseModel):
    """Error response."""
    detail: str

