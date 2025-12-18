"""
Image proxy endpoint.
"""

import io
from fastapi import APIRouter, Query, HTTPException, status, Response
from fastapi.responses import StreamingResponse
from PIL import Image as PILImage
import httpx
from typing import Optional

from app.config import get_settings
from app.core.utils import is_private_ip, is_allowed_image_domain, parse_url_domain
from app.deps import get_store_by_id

router = APIRouter()


@router.get("")
async def proxy_image(
    u: str = Query(..., description="Image URL"),
    w: int = Query(240, ge=1, le=2000, description="Width"),
    h: int = Query(240, ge=1, le=2000, description="Height")
):
    """
    Proxy and resize image with SSRF protection.
    """
    settings = get_settings()
    
    # Parse URL
    from urllib.parse import urlparse
    try:
        parsed = urlparse(u)
        hostname = parsed.hostname
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid URL"
        )
    
    # SSRF protection: block private IPs
    if is_private_ip(hostname):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to private IPs is not allowed"
        )
    
    # Check allowed domains
    allowed_domains = []
    if settings.allow_image_domains:
        allowed_domains = [d.strip() for d in settings.allow_image_domains.split(",")]
    
    # Note: We don't have store_id here, so can't check store domain
    # In production, you might want to pass store_id or extract from referer
    if allowed_domains and not is_allowed_image_domain(u, allowed_domains, None):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Domain not in allowlist"
        )
    
    # Fetch image
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(u)
            response.raise_for_status()
            
            # Load image
            img = PILImage.open(io.BytesIO(response.content))
            
            # Resize (fit to dimensions, maintain aspect ratio)
            img.thumbnail((w, h), PILImage.Resampling.LANCZOS)
            
            # Convert to bytes
            output = io.BytesIO()
            # Try WebP, fallback to JPEG
            try:
                img.save(output, format="WEBP", quality=85)
                content_type = "image/webp"
            except Exception:
                output = io.BytesIO()
                img = img.convert("RGB")
                img.save(output, format="JPEG", quality=85)
                content_type = "image/jpeg"
            
            output.seek(0)
            
            return StreamingResponse(
                output,
                media_type=content_type,
                headers={
                    "Cache-Control": "public, max-age=86400"  # Cache for 1 day
                }
            )
    
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error fetching image: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing image: {str(e)}"
        )

