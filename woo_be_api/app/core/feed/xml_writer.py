"""
XML Writer for Google Shopping Feed (GMC) and Bing Merchant Center Feed.
"""

import xml.etree.ElementTree as ET
from xml.dom import minidom
import re
from typing import List, Optional, Callable, Literal

from .models import FeedItem, FeedConfig


# Google Shopping namespace
G_NS = 'http://base.google.com/ns/1.0'


def write_feed_xml(
    items: List[FeedItem],
    config: FeedConfig,
    channel: Literal["gmc", "bing"] = "gmc",
    log_callback: Optional[Callable[[str], None]] = None
) -> Optional[str]:
    """
    Generate Google Shopping Feed (GMC) or Bing Merchant Center Feed XML from feed items.
    
    Args:
        items: List of FeedItem objects
        config: FeedConfig with feed metadata
        channel: "gmc" for Google Merchant Center or "bing" for Bing Merchant Center
        log_callback: Optional callback for logging (receives message string)
    
    Returns:
        XML string, or None on error
    """
    def log(msg: str):
        if log_callback:
            if not msg.endswith('\n'):
                msg = msg + '\n'
            log_callback(msg)
    
    try:
        channel_name = "Google Merchant Center" if channel == "gmc" else "Bing Merchant Center"
        log(f"--- Bắt đầu tạo cấu trúc XML {channel_name} ---")
        
        # Register namespace
        ET.register_namespace('g', G_NS)
        
        # Create RSS root
        rss = ET.Element('rss', {'version': '2.0'})
        
        channel_elem = ET.SubElement(rss, 'channel')
        ET.SubElement(channel_elem, 'title').text = f"{channel_name} Feed - {config.store_name}"
        ET.SubElement(channel_elem, 'link').text = config.store_url
        ET.SubElement(channel_elem, 'description').text = f"{channel_name} Product Feed"
        
        gender = config.gender
        age_group = config.age_group
        
        for i, item in enumerate(items):
            log(f"⚙️ Thêm mục XML cho sản phẩm/biến thể ID {item.id} ({i+1}/{len(items)})...")
            feed_item = ET.SubElement(channel_elem, 'item')
            
            # Use proper namespace prefix for all Google Shopping elements
            ET.SubElement(feed_item, f'{{{G_NS}}}id').text = str(item.id)
            
            # Only include item_group_id if it exists (for variations)
            if item.item_group_id:
                ET.SubElement(feed_item, f'{{{G_NS}}}item_group_id').text = str(item.item_group_id)
            
            ET.SubElement(feed_item, f'{{{G_NS}}}title').text = item.title
            ET.SubElement(feed_item, f'{{{G_NS}}}description').text = item.description
            ET.SubElement(feed_item, f'{{{G_NS}}}link').text = item.link
            ET.SubElement(feed_item, f'{{{G_NS}}}image_link').text = item.image_link
            
            # Additional images (optional)
            if item.additional_images:
                for add_src in item.additional_images[:5]:
                    if add_src:
                        ET.SubElement(feed_item, f'{{{G_NS}}}additional_image_link').text = add_src
            
            ET.SubElement(feed_item, f'{{{G_NS}}}brand').text = item.brand or config.store_name
            ET.SubElement(feed_item, f'{{{G_NS}}}google_product_category').text = str(config.google_shopping_category_id)
            
            # Price: use regular_price, sale_price if available
            price_str = f"{item.price:.2f} {config.price_currency}"
            ET.SubElement(feed_item, f'{{{G_NS}}}price').text = price_str
            
            # Sale price: only include if on sale (desktop parity: blank if no sale)
            if item.sale_price and item.sale_price > 0 and item.sale_price < item.price:
                sale_price_str = f"{item.sale_price:.2f} {config.price_currency}"
                ET.SubElement(feed_item, f'{{{G_NS}}}sale_price').text = sale_price_str
            # Desktop parity: do not include sale_price element if no sale (not even empty string)
            
            ET.SubElement(feed_item, f'{{{G_NS}}}availability').text = item.availability
            ET.SubElement(feed_item, f'{{{G_NS}}}mpn').text = item.mpn
            ET.SubElement(feed_item, f'{{{G_NS}}}condition').text = item.condition
            ET.SubElement(feed_item, f'{{{G_NS}}}product_type').text = item.product_type
            ET.SubElement(feed_item, f'{{{G_NS}}}color').text = item.color
            
            # Only include size if it exists (no default)
            if item.size and item.size.strip():
                ET.SubElement(feed_item, f'{{{G_NS}}}size').text = item.size
            
            # Optional fields - only include if configured
            if gender and gender.strip():
                ET.SubElement(feed_item, f'{{{G_NS}}}gender').text = gender.strip()
            if age_group and age_group.strip():
                ET.SubElement(feed_item, f'{{{G_NS}}}age_group').text = age_group.strip()
        
        # Serialize to XML string
        xml_string = ET.tostring(rss, encoding='unicode', method='xml')
        
        # Fix duplicate attributes in rss tag BEFORE parsing
        rss_match = re.search(r'<rss[^>]*>', xml_string)
        if rss_match:
            rss_tag = rss_match.group(0)
            attrs_seen = set()
            attr_pattern = r'(\S+?)="([^"]*)"'
            new_attrs = []
            
            for match in re.finditer(attr_pattern, rss_tag):
                attr_full = match.group(0)
                attr_name = match.group(1)
                
                if attr_name not in attrs_seen:
                    new_attrs.append(attr_full)
                    attrs_seen.add(attr_name)
            
            if len(new_attrs) < len(re.findall(attr_pattern, rss_tag)):
                new_rss_tag = '<rss ' + ' '.join(new_attrs) + '>'
                xml_string = xml_string.replace(rss_tag, new_rss_tag)
        
        # Ensure namespace is declared
        if 'xmlns:g=' not in xml_string:
            xml_string = re.sub(
                r'(<rss[^>]*version="2.0")',
                r'\1 xmlns:g="http://base.google.com/ns/1.0"',
                xml_string
            )
        
        # Parse with minidom for pretty printing
        try:
            dom = minidom.parseString(xml_string)
            pretty_xml = dom.toprettyxml(indent='  ', encoding='utf-8')
            pretty_xml_str = pretty_xml.decode('utf-8')
        except Exception as parse_error:
            log(f"⚠️ Lỗi khi parse XML với minidom: {parse_error}")
            log(f"XML string (first 1000 chars):\n{xml_string[:1000]}")
            pretty_xml_str = xml_string
        
        # Fix namespace prefixes
        pretty_xml_str = re.sub(r'<ns\d+:', '<g:', pretty_xml_str)
        pretty_xml_str = re.sub(r'</ns\d+:', '</g:', pretty_xml_str)
        pretty_xml_str = re.sub(r'\s*xmlns:ns\d+="[^"]*"', '', pretty_xml_str)
        
        log("✅ Hoàn tất tạo XML feed")
        return pretty_xml_str
        
    except Exception as e:
        log(f"❌ Lỗi khi tạo XML string: {e}")
        import traceback
        log(f"Traceback: {traceback.format_exc()}")
        return None

