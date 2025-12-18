"""
Utility functions.
"""

import re
import hashlib
import asyncio
from typing import Optional, List, Any, Dict, Callable, Awaitable
from urllib.parse import urlparse
from datetime import datetime
import json


def sanitize_slug(text: str) -> str:
    """Convert text to URL-safe slug."""
    if not text:
        return ""
    slug = re.sub(r'[^\w\s-]', '', text.lower())
    slug = re.sub(r'[-\s]+', '-', slug)
    return slug.strip('-')


def hash_url(url: str) -> str:
    """Generate hash for URL (for cache keys)."""
    return hashlib.md5(url.encode()).hexdigest()


def is_private_ip(hostname: str) -> bool:
    """
    Check if hostname resolves to private/local IP.
    Basic check - blocks common private IP patterns.
    """
    if not hostname:
        return True
    
    # Check for localhost variants
    if hostname.lower() in ('localhost', '127.0.0.1', '::1', '0.0.0.0'):
        return True
    
    # Check for private IP ranges (basic pattern matching)
    private_patterns = [
        r'^10\.',
        r'^172\.(1[6-9]|2[0-9]|3[01])\.',
        r'^192\.168\.',
        r'^169\.254\.',  # Link-local
        r'^127\.',  # Loopback
    ]
    
    for pattern in private_patterns:
        if re.match(pattern, hostname):
            return True
    
    return False


def parse_url_domain(url: str) -> Optional[str]:
    """Extract domain from URL."""
    try:
        parsed = urlparse(url)
        return parsed.netloc.split(':')[0]  # Remove port if present
    except Exception:
        return None


def is_allowed_image_domain(url: str, allowed_domains: list, store_domain: Optional[str] = None) -> bool:
    """
    Check if image URL is from allowed domain.
    
    Args:
        url: Image URL to check
        allowed_domains: List of allowed domain strings
        store_domain: Store's own domain (always allowed)
    
    Returns:
        True if allowed, False otherwise
    """
    domain = parse_url_domain(url)
    if not domain:
        return False
    
    # Always allow store's own domain
    if store_domain:
        store_domain_clean = parse_url_domain(store_domain)
        if store_domain_clean and domain == store_domain_clean:
            return True
    
    # Check against allowlist
    if allowed_domains:
        for allowed in allowed_domains:
            allowed_clean = allowed.strip().lower()
            if domain.lower() == allowed_clean or domain.lower().endswith('.' + allowed_clean):
                return True
    
    return False


def chunked(lst: List[Any], size: int):
    """
    Split list into chunks of specified size.
    """
    for i in range(0, len(lst), size):
        yield lst[i:i + size]


async def retry_with_backoff_async(
    func: Callable[[], Awaitable[tuple[bool, Any, Optional[int]]]],
    max_retries: int = 4,
    initial_delay: float = 2.0,
    backoff_factor: float = 2.0,
    retry_on_status: List[int] = None
) -> tuple[bool, Any, Optional[int]]:
    """
    Retry async function with exponential backoff.
    
    Args:
        func: Async function to retry (must return tuple (success: bool, result: Any, status_code: int))
        max_retries: Maximum number of retries
        initial_delay: Initial delay in seconds
        backoff_factor: Backoff multiplier
        retry_on_status: List of status codes to retry on (default: [504, 500, 502, 503, 429])
    
    Returns:
        (success: bool, result: Any, status_code: int)
    """
    if retry_on_status is None:
        retry_on_status = [504, 500, 502, 503, 429]
    
    delay = initial_delay
    result = None
    status_code = None
    
    for attempt in range(max_retries + 1):
        try:
            success, result, status_code = await func()
            
            if success:
                return True, result, status_code
            
            # If status code doesn't need retry, return immediately
            if status_code and status_code not in retry_on_status:
                return False, result, status_code
            
            # If exhausted retries
            if attempt >= max_retries:
                return False, result, status_code
            
            # Retry with backoff
            await asyncio.sleep(delay)
            delay *= backoff_factor
            
        except Exception as e:
            result = str(e)
            status_code = None
            if attempt >= max_retries:
                return False, result, status_code
            await asyncio.sleep(delay)
            delay *= backoff_factor
    
    return False, result, status_code


def extract_slug_from_url(url: str) -> Optional[str]:
    """
    Extract product slug from URL.
    Example: /product/embroidered-floral-daisy-sweatshirt/ -> "embroidered-floral-daisy-sweatshirt"
    """
    try:
        pattern = r"/product/([^/?#]+)/?"
        match = re.search(pattern, url)
        return match.group(1) if match else None
    except Exception:
        return None

