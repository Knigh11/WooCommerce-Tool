"""
Feed generation core module.
"""

from .models import FeedItem, FeedConfig
from .fetcher import fetch_woocommerce_products
from .xml_writer import write_feed_xml
from .adapters import feed_items_to_legacy_dict

__all__ = [
    'FeedItem',
    'FeedConfig',
    'fetch_woocommerce_products',
    'write_feed_xml',
    'feed_items_to_legacy_dict'
]

