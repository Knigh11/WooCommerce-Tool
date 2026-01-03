"""
Adapters for converting between FeedItem and legacy dict formats.
"""

from typing import List, Dict, Any
from urllib.parse import urlparse

from .models import FeedItem, FeedConfig


def _extract_domain_name(store_url: str) -> str:
    """Extract domain name from store URL for MPN generation."""
    try:
        parsed_url = urlparse(store_url)
        domain_name = parsed_url.netloc.lower()
        
        common_prefixes = ['www.', 'shop.', 'store.', 'app.', 'admin.']
        for prefix in common_prefixes:
            if domain_name.startswith(prefix):
                domain_name = domain_name[len(prefix):]
                break
        
        domain_parts = domain_name.split('.')
        
        special_tlds = ['co.uk', 'com.au', 'co.za', 'co.nz', 'com.br', 'com.mx']
        if len(domain_parts) >= 3:
            last_two = '.'.join(domain_parts[-2:])
            if last_two in special_tlds:
                return domain_parts[0]
        
        if len(domain_parts) >= 2:
            return domain_parts[0]
        
        return domain_name
    except Exception:
        return 'store'


def feed_items_to_legacy_dict(items: List[FeedItem], config: FeedConfig) -> List[Dict[str, Any]]:
    """
    Convert List[FeedItem] to legacy dict format expected by Sheets/Local exporters.
    
    Args:
        items: List of FeedItem objects
        config: FeedConfig for defaults
        
    Returns:
        List of dicts in legacy format
    """
    domain_name = _extract_domain_name(config.store_url)
    legacy_products = []
    
    for item in items:
        mpn = item.mpn
        if not mpn:
            mpn = f'{domain_name}_{item.id}'
        
        color = item.color
        if not color or color.strip() == '':
            color = 'Multi Color'
        
        size = item.size
        if not size or size.strip() == '':
            size = 'One Size'
        
        sale_price = item.sale_price if item.sale_price is not None else 0.0
        regular_price = item.regular_price if item.regular_price is not None else item.price
        
        legacy_dict = {
            'id': item.id,
            'item_group_id': item.item_group_id or '',
            'title': item.title,
            'description': item.description,
            'link': item.link,
            'image_link': item.image_link,
            'additional_images': item.additional_images or [],
            'color': color,
            'size': size,
            'sale_price': sale_price,
            'regular_price': regular_price,
            'availability': item.availability,
            'mpn': mpn,
            'condition': item.condition,
            'product_type': item.product_type,
        }
        
        legacy_products.append(legacy_dict)
    
    return legacy_products

