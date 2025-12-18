"""
Image resolver for WP Media and FIFU (external URLs).
Normalizes image data for frontend consumption.
"""

from typing import List, Dict, Optional, Any
from urllib.parse import urlparse


def resolve_product_images(product_data: Dict[str, Any], base_url: Optional[str] = None) -> Dict[str, Any]:
    """
    Resolve product images from WooCommerce product data.
    
    Handles:
    - WP Media: product["images"] array with src/id
    - FIFU: meta_data with fifu_image_url / fifu_list_url
    
    Args:
        product_data: WooCommerce product JSON
        base_url: Base URL for generating thumbnail proxy URLs
    
    Returns:
        Dict with:
        - image: Featured image dict (mode, original, thumb, attachment_id?, fifu_url?)
        - gallery: List of gallery image dicts
    """
    featured = None
    gallery = []
    
    # Check WP Media images first
    wc_images = product_data.get("images", [])
    if wc_images and len(wc_images) > 0:
        # First image is featured
        featured_img = wc_images[0]
        featured = {
            "mode": "wp",
            "original": featured_img.get("src", ""),
            "thumb": _generate_thumb_url(featured_img.get("src", ""), base_url),
            "attachment_id": featured_img.get("id"),
            "alt": featured_img.get("alt", "")
        }
        
        # Remaining images are gallery
        for img in wc_images[1:]:
            gallery.append({
                "mode": "wp",
                "original": img.get("src", ""),
                "thumb": _generate_thumb_url(img.get("src", ""), base_url),
                "attachment_id": img.get("id"),
                "alt": img.get("alt", "")
            })
    
    # Check FIFU meta_data if no WP images
    if not featured:
        meta_data = product_data.get("meta_data", [])
        fifu_featured_url = None
        fifu_gallery_urls = []
        
        for meta in meta_data:
            if not isinstance(meta, dict):
                continue
            
            key = meta.get("key", "")
            value = meta.get("value", "")
            
            if key == "fifu_image_url" and value:
                fifu_featured_url = value
            elif key == "fifu_list_url" and value:
                # Pipe-separated list
                fifu_gallery_urls = [url.strip() for url in str(value).split("|") if url.strip()]
        
        # Use FIFU featured if available
        if fifu_featured_url:
            featured = {
                "mode": "fifu",
                "original": fifu_featured_url,
                "thumb": _generate_thumb_url(fifu_featured_url, base_url),
                "fifu_url": fifu_featured_url
            }
        
        # Add FIFU gallery (excluding featured if it's in the list)
        for url in fifu_gallery_urls:
            if url != fifu_featured_url:
                gallery.append({
                    "mode": "fifu",
                    "original": url,
                    "thumb": _generate_thumb_url(url, base_url),
                    "fifu_url": url
                })
    
    # Default to "none" if no images found
    if not featured:
        featured = {
            "mode": "none",
            "original": "",
            "thumb": ""
        }
    
    return {
        "image": featured,
        "gallery": gallery
    }


def _generate_thumb_url(original_url: str, base_url: Optional[str] = None) -> str:
    """
    Generate thumbnail proxy URL.
    
    Args:
        original_url: Original image URL
        base_url: API base URL (e.g., http://localhost:8000)
    
    Returns:
        Thumbnail proxy URL or original if base_url not provided
    """
    if not original_url or not base_url:
        return original_url
    
    from urllib.parse import quote
    encoded_url = quote(original_url, safe='')
    return f"{base_url}/api/v1/img?u={encoded_url}&w=240&h=240"


def normalize_product_image_summary(product: Dict[str, Any], base_url: Optional[str] = None) -> Dict[str, Any]:
    """
    Create normalized image summary for product list view.
    
    Args:
        product: WooCommerce product JSON
        base_url: API base URL for thumbnails
    
    Returns:
        Image dict with mode, original, thumb, etc.
    """
    resolved = resolve_product_images(product, base_url)
    return resolved["image"]


def normalize_product_images_detail(product: Dict[str, Any], base_url: Optional[str] = None) -> Dict[str, Any]:
    """
    Create normalized image data for product detail view.
    
    Args:
        product: WooCommerce product JSON
        base_url: API base URL for thumbnails
    
    Returns:
        Dict with image (featured) and gallery (list)
    """
    return resolve_product_images(product, base_url)

