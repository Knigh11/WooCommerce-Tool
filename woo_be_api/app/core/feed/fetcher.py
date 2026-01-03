"""
Fetch products from WooCommerce for feed generation.
"""

import re
import json
from typing import List, Optional, Callable, Tuple, Dict, Any
from urllib.parse import urlparse, urlencode, parse_qs, urlunparse

from app.core.woo_client import WooClient
from .models import FeedConfig, FeedItem


def strip_html(description: str) -> str:
    """Strip HTML tags, links, and image references from description, returning plain text."""
    if not description:
        return ''
    # Remove HTML tags
    description = re.sub(r'<[^>]+>', '', description)
    # Remove links
    description = re.sub(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', '', description)
    # Remove image references
    description = re.sub(r'\[.*?\]', '', description)
    # Remove extra whitespace
    description = re.sub(r'\s+', ' ', description).strip()
    return description


def parse_variation_attributes(variation: dict) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
    """
    Parse variation attributes to extract size and color values and keys.
    
    Returns: (size_value, color_value, size_key, color_key)
    """
    size_value = None
    color_value = None
    size_key = None
    color_key = None
    
    if not isinstance(variation, dict):
        return size_value, color_value, size_key, color_key
    
    for attr in variation.get('attributes', []) or []:
        if not isinstance(attr, dict):
            continue
        attr_name = attr.get('name', '')
        attr_option = attr.get('option', '')
        
        if not attr_name or not attr_option:
            continue
        
        attr_name_lower = attr_name.lower()
        attr_name_clean = attr_name_lower
        if attr_name_clean.startswith('attribute_'):
            attr_name_clean = attr_name_clean[len('attribute_'):]
        
        # Check for size
        if attr_name_clean in ['size', 'pa_size'] and size_value is None:
            size_value = attr_option
            size_key = attr_name_lower
        
        # Check for color
        if attr_name_clean in ['color', 'pa_color'] and color_value is None:
            color_value = attr_option
            color_key = attr_name_lower
    
    return size_value, color_value, size_key, color_key


def build_variation_link(
    permalink: str,
    size_key: Optional[str] = None,
    size_value: Optional[str] = None,
    color_key: Optional[str] = None,
    color_value: Optional[str] = None
) -> str:
    """Build variation link with attribute query parameters."""
    if not permalink:
        return ''
    
    try:
        parsed = urlparse(permalink)
        query_params = parse_qs(parsed.query)
        
        def get_query_key(attr_key):
            """Convert attribute key to WooCommerce query parameter name."""
            if not attr_key:
                return None
            clean_key = attr_key.replace('attribute_', '')
            if clean_key.startswith('pa_'):
                return f'attribute_{clean_key}'
            else:
                return f'attribute_{clean_key}'
        
        if size_key and size_value:
            query_key = get_query_key(size_key)
            if query_key:
                query_params[query_key] = [size_value]
        
        if color_key and color_value:
            query_key = get_query_key(color_key)
            if query_key:
                query_params[query_key] = [color_value]
        
        new_query = urlencode(query_params, doseq=True)
        new_parsed = parsed._replace(query=new_query)
        result_url = urlunparse(new_parsed)
        result_url = result_url.replace('%20', '+')
        return result_url
    except Exception:
        return permalink


def _safe_float(value: Any, default: float = 0.0) -> float:
    """Convert value to float safely."""
    try:
        if value is None:
            return default
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            s = value.strip()
            if not s:
                return default
            s = s.replace(',', '').replace('$', '').replace('USD', '').strip()
            return float(s)
        return default
    except Exception:
        return default


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


async def fetch_woocommerce_products(
    client: WooClient,
    config: FeedConfig,
    log_callback: Optional[Callable[[str], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None
) -> List[FeedItem]:
    """
    Fetch products from WooCommerce and convert to FeedItem objects.
    
    For variable products: generates ONE FeedItem per variation.
    For simple products: generates ONE FeedItem.
    
    Args:
        client: WooClient instance
        config: FeedConfig with store credentials and filters
        log_callback: Optional callback for logging
        cancel_check: Optional async function to check if cancelled
    
    Returns:
        List of FeedItem objects ready for XML generation
    """
    def log(msg: str):
        if log_callback:
            if not msg.endswith('\n'):
                msg = msg + '\n'
            log_callback(msg)
    
    feed_items: List[FeedItem] = []
    params: Dict[str, Any] = {'per_page': 100}
    
    if config.woocommerce_category_id:
        params['category'] = str(config.woocommerce_category_id)
    
    if config.after_date:
        params['after'] = config.after_date
    
    if config.specific_product_ids:
        params['include'] = ','.join(map(str, config.specific_product_ids))
    
    page = 1
    total_products_fetched = 0
    consecutive_errors = 0
    successful_products = 0
    failed_products = []
    failed_variations = []
    skipped_out_of_stock = 0
    
    log("--- Bắt đầu tải sản phẩm từ WooCommerce ---")
    
    domain_name = _extract_domain_name(config.store_url)
    
    while True:
        if cancel_check and cancel_check():
            log("ℹ️ Quá trình tải sản phẩm đã bị hủy.")
            return []
        
        params['page'] = page
        log(f"🚚 Đang tải trang {page} từ WooCommerce API (100 sản phẩm/trang)...")
        
        try:
            # Use WooClient's _request method directly
            response = await client._request("GET", "/wp-json/wc/v3/products", params=params)
            current_products = response.json() if hasattr(response, 'json') else []
            if not isinstance(current_products, list):
                current_products = []
        except Exception as api_error:
            consecutive_errors += 1
            log(f"❌ Lỗi API khi tải trang {page} (lỗi #{consecutive_errors}): {api_error}")
            
            if consecutive_errors >= 3:
                log(f"❌ Quá nhiều lỗi liên tiếp ({consecutive_errors}). Dừng tải sản phẩm.")
                return []
            
            import asyncio
            await asyncio.sleep(5)
            continue
        
        if not current_products:
            if page == 1:
                log("❌ Trang đầu tiên không có sản phẩm, có thể do cấu hình sai hoặc API lỗi")
                return []
            else:
                log(f" Không còn sản phẩm trên trang {page}. Đã tải hết.")
                break
        
        log(f"✅ Đã tải thành công {len(current_products)} sản phẩm trên trang {page}.")
        consecutive_errors = 0
        
        for product in current_products:
            if config.product_limit and total_products_fetched >= config.product_limit:
                log(f"🚫 Đã đạt giới hạn {config.product_limit} sản phẩm. Dừng tải sản phẩm.")
                break
            
            if cancel_check and cancel_check():
                log("ℹ️ Quá trình tải sản phẩm đã bị hủy.")
                return []
            
            product_id = product.get('id')
            product_name = product.get('name', 'Không có tên')
            log(f"⚙️ Bắt đầu xử lý sản phẩm ID: {product_id}, Tên: '{product_name}'")
            
            # Get parent product data
            image_link = product.get('images', [{}])[0].get('src', '') if product.get('images') else ''
            description = strip_html(product.get('description', ''))
            
            product_type_final = config.product_overrides.get(str(product_id), {}).get(
                'product_type', config.google_product_type_default
            )
            
            brand_name = config.store_name
            parent_permalink = product.get('permalink', '')
            
            # Get parent gallery images for additional_images
            parent_gallery = []
            if product.get('images'):
                for img in product.get('images', []):
                    img_src = img.get('src', '')
                    if img_src and img_src != image_link:  # Exclude main image
                        parent_gallery.append(img_src)
            
            # Process variable products - ONE item per variation
            if product.get('type') == 'variable' and product.get('variations'):
                log(f"    Sản phẩm biến thể: ID {product_id}. Đang tải chi tiết biến thể...")
                
                if cancel_check and cancel_check():
                    log("ℹ️ Quá trình tải biến thể đã bị hủy.")
                    return []
                
                # Fetch all variations with pagination
                all_variations = []
                var_page = 1
                while True:
                    try:
                        variations_response = await client._request(
                            "GET",
                            f"/wp-json/wc/v3/products/{product_id}/variations",
                            params={'per_page': 100, 'page': var_page}
                        )
                        page_variations = variations_response.json() if hasattr(variations_response, 'json') else []
                        if not isinstance(page_variations, list):
                            page_variations = []
                    except Exception as var_api_error:
                        log(f"❌ Lỗi API khi tải biến thể cho sản phẩm {product_id} (trang {var_page}): {var_api_error}")
                        if var_page == 1:
                            failed_products.append(product_id)
                            log(f"⚠️ Bỏ qua sản phẩm {product_id} do lỗi API và tiếp tục với sản phẩm tiếp theo.")
                        break
                    
                    if not page_variations:
                        break
                    
                    all_variations.extend(page_variations)
                    
                    if len(page_variations) < 100:
                        break
                    
                    var_page += 1
                
                if not all_variations:
                    log(f"⚠️ Sản phẩm {product_id} không có biến thể hoặc response rỗng")
                    failed_products.append(product_id)
                    continue
                
                log(f"    📦 Tìm thấy {len(all_variations)} biến thể cho sản phẩm ID {product_id}. Tạo một item cho mỗi biến thể...")
                
                # Process ALL variations - create one item per variation
                for variation in all_variations:
                    if not variation or not isinstance(variation, dict):
                        continue
                    
                    if config.product_limit and total_products_fetched >= config.product_limit:
                        log(f"🚫 Đã đạt giới hạn {config.product_limit} sản phẩm. Dừng tải biến thể.")
                        break
                    
                    if cancel_check and cancel_check():
                        log("ℹ️ Quá trình tải biến thể đã bị hủy.")
                        return []
                    
                    var_id = variation.get('id')
                    if not var_id:
                        continue
                    
                    # Parse variation attributes
                    size_value, color_value, size_key, color_key = parse_variation_attributes(variation)
                    
                    # Get variation image or fallback to parent
                    var_image_link = image_link
                    if variation.get('image') and isinstance(variation['image'], dict):
                        var_image_link = variation['image'].get('src', image_link)
                    
                    # Build title
                    variation_title = product_name
                    title_parts = []
                    
                    if size_value:
                        size_display_key = size_key.replace('attribute_', '') if size_key else 'size'
                        title_parts.append(f"{size_display_key}: {size_value}")
                    
                    if color_value:
                        color_display_key = color_key.replace('attribute_', '') if color_key else 'color'
                        title_parts.append(f"{color_display_key}: {color_value}")
                    
                    if title_parts:
                        variation_title = f"{product_name} - {' - '.join(title_parts)}"
                    
                    # Build variation link
                    variation_link = build_variation_link(
                        parent_permalink, size_key, size_value, color_key, color_value
                    )
                    
                    # Set color default if missing
                    if not color_value or color_value.strip() == '':
                        color_value = 'Multi Color'
                    
                    # Get availability
                    is_in_stock = variation.get('stock_status') == 'instock'
                    availability = 'in stock' if is_in_stock else 'out of stock'
                    
                    if not is_in_stock:
                        skipped_out_of_stock += 1
                        log(f"        ℹ️ Biến thể ID {var_id} - Out of stock (vẫn được thêm vào feed)")
                    
                    # Get price
                    regular_price = _safe_float(variation.get('regular_price'), 0.0)
                    if regular_price <= 0:
                        regular_price = _safe_float(variation.get('price'), 0.0)
                    
                    sale_price = _safe_float(variation.get('sale_price'), 0.0)
                    if sale_price <= 0:
                        sale_price = None
                    
                    # Get MPN
                    mpn = f'{domain_name}_{var_id}'
                    
                    try:
                        feed_item = FeedItem(
                            id=str(var_id),
                            item_group_id=str(product_id),
                            title=variation_title,
                            description=description,
                            link=variation_link,
                            image_link=var_image_link,
                            additional_images=parent_gallery.copy(),  # FIX: additional_images from parent
                            price=regular_price,
                            sale_price=sale_price,
                            regular_price=regular_price,
                            availability=availability,
                            product_type=product_type_final,
                            color=color_value,
                            size=size_value if size_value else None,
                            brand=brand_name,
                            mpn=mpn,
                            sku=variation.get('sku', '')
                        )
                        feed_items.append(feed_item)
                        total_products_fetched += 1
                        log(f"        ➕ Thêm biến thể ID {var_id} ({variation_title[:50]}...). Tổng: {total_products_fetched}")
                    except Exception as var_error:
                        log(f"        ❌ Lỗi khi xử lý biến thể {var_id}: {var_error}")
                        failed_variations.append(var_id)
                        continue
                
                log(f"    ✔️ Hoàn tất xử lý {len(all_variations)} biến thể cho sản phẩm ID {product_id}")
            
            else:
                # Simple product - ONE item
                log(f"    Sản phẩm đơn giản: ID {product_id}.")
                
                try:
                    # Parse attributes for simple product
                    color = "Multi Color"
                    size_value = None
                    for attr in product.get('attributes', []):
                        if not isinstance(attr, dict):
                            continue
                        attr_name = attr.get('name', '').lower()
                        if attr_name in ['color', 'pa_color'] and attr.get('options'):
                            color = attr['options'][0]
                        if attr_name in ['size', 'pa_size'] and attr.get('options'):
                            size_value = attr['options'][0]
                    
                    is_in_stock = product.get('stock_status') == 'instock'
                    availability = 'in stock' if is_in_stock else 'out of stock'
                    
                    if not is_in_stock:
                        skipped_out_of_stock += 1
                        log(f"      ℹ️ Sản phẩm ID {product_id} - Out of stock (vẫn được thêm vào feed)")
                    
                    # Get price
                    regular_price = _safe_float(product.get('regular_price'), 0.0)
                    if regular_price <= 0:
                        regular_price = _safe_float(product.get('price'), 0.0)
                    
                    sale_price = _safe_float(product.get('sale_price'), 0.0)
                    if sale_price <= 0:
                        sale_price = None
                    
                    # Get MPN
                    mpn = f'{domain_name}_{product_id}'
                    
                    feed_item = FeedItem(
                        id=str(product_id),
                        title=product_name,
                        description=description,
                        link=parent_permalink,
                        image_link=image_link,
                        additional_images=parent_gallery.copy(),  # FIX: additional_images from parent
                        price=regular_price,
                        sale_price=sale_price,
                        regular_price=regular_price,
                        availability=availability,
                        product_type=product_type_final,
                        color=color,
                        size=size_value if size_value else None,
                        brand=brand_name,
                        mpn=mpn,
                        sku=product.get('sku', '')
                    )
                    feed_items.append(feed_item)
                    total_products_fetched += 1
                    successful_products += 1
                    log(f"      ➕ Thêm sản phẩm đơn giản ID {product_id}. Tổng: {total_products_fetched}")
                except Exception as simple_error:
                    failed_products.append(product_id)
                    log(f"      ❌ Lỗi khi xử lý sản phẩm đơn giản {product_id}: {simple_error}")
                    continue
            
            if config.product_limit and total_products_fetched >= config.product_limit:
                break
        
        if config.product_limit and total_products_fetched >= config.product_limit:
            break
        
        page += 1
    
    # Log statistics
    log("--- 📊 THỐNG KÊ KẾT QUẢ ---")
    log(f"✅ Sản phẩm thành công: {successful_products}")
    log(f"❌ Sản phẩm thất bại: {len(failed_products)}")
    if failed_products:
        log(f" Danh sách sản phẩm thất bại: {', '.join(map(str, failed_products))}")
    if failed_variations:
        log(f" Danh sách biến thể thất bại: {', '.join(map(str, failed_variations))}")
    log(f" Sản phẩm out of stock: {skipped_out_of_stock}")
    log(f"📦 Tổng số items trong feed: {len(feed_items)}")
    log("--- ✅ Hoàn tất tải sản phẩm từ WooCommerce ---")
    
    return feed_items

