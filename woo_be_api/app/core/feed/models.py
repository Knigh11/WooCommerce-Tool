"""
Feed data models.
"""

from dataclasses import dataclass
from typing import Optional, List, Dict, Any


@dataclass
class FeedConfig:
    """Feed generation configuration."""
    # Store connection
    store_url: str
    consumer_key: str
    consumer_secret: str
    store_name: str
    
    # Filters
    woocommerce_category_id: Optional[int] = None
    product_limit: int = 0  # 0 = all
    after_date: Optional[str] = None  # YYYY-MM-DD HH:MM:SS format
    specific_product_ids: Optional[List[int]] = None
    
    # Feed metadata
    google_shopping_category_id: str = ''  # Required
    google_product_type_default: str = 'General Merchandise'
    gender: Optional[str] = None  # 'male', 'female', 'unisex', or None
    age_group: Optional[str] = None  # 'newborn', 'infant', 'toddler', 'kids', 'adult', or None
    price_currency: str = 'USD'
    
    # Product overrides
    product_overrides: Dict[str, Dict[str, str]] = None  # {product_id: {'product_type': '...'}}
    
    # Output settings
    output_folder: str = 'output'
    output_filename: str = 'google_shopping_feed.xml'
    auto_rename: bool = True
    
    # Advanced settings
    verify_ssl: bool = True
    query_string_auth: bool = False
    
    def __post_init__(self):
        if self.product_overrides is None:
            self.product_overrides = {}


@dataclass
class FeedItem:
    """Normalized feed item data structure."""
    # Identifiers
    id: str  # Product ID or variation ID
    item_group_id: Optional[str] = None  # Parent product ID for variations
    
    # Product information
    title: str = ''
    description: str = ''
    link: str = ''
    image_link: str = ''
    additional_images: List[str] = None
    
    # Pricing
    price: float = 0.0  # Regular price (use this for g:price)
    sale_price: Optional[float] = None
    regular_price: Optional[float] = None
    
    # Attributes
    availability: str = 'in stock'  # 'in stock' or 'out of stock'
    mpn: str = ''  # Manufacturer Part Number
    sku: str = ''
    condition: str = 'new'
    
    # Google Shopping fields
    product_type: str = 'General Merchandise'
    color: str = 'Multi Color'
    size: Optional[str] = None  # Only include if exists
    brand: str = ''
    
    def __post_init__(self):
        if self.additional_images is None:
            self.additional_images = []

