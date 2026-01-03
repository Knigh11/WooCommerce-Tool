"""
Google Sheets Writer for Feed Export.

Ports the desktop app's sheets export logic to async FastAPI backend.
"""

import base64
import json
import tempfile
import os
from typing import List, Dict, Any, Optional, Callable
from pathlib import Path

try:
    import gspread
    from gspread.exceptions import WorksheetNotFound
    GSPREAD_AVAILABLE = True
except ImportError:
    gspread = None
    GSPREAD_AVAILABLE = False
    class WorksheetNotFound(Exception):
        pass

from .models import FeedConfig


def _format_sale_price(sale_price: Any) -> str:
    """
    Format sale price for Google Sheets.
    Returns empty string if sale_price is 0, None, or empty.
    """
    if sale_price is None:
        return ""
    
    try:
        price_float = float(sale_price)
        if price_float <= 0:
            return ""
        return f"{price_float:.2f} USD"
    except (ValueError, TypeError):
        return ""


async def export_to_sheets(
    products_data: List[Dict[str, Any]],
    config: FeedConfig,
    sheets_config: Dict[str, Any],
    log_callback: Optional[Callable[[str], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None
) -> tuple[bool, str, int]:
    """
    Push feed data to Google Sheets.
    
    Args:
        products_data: List of dicts in legacy format (from adapters.feed_items_to_legacy_dict)
        config: FeedConfig with feed settings
        sheets_config: Dict with sheet_id, tab_name, credentials_json_base64
        log_callback: Optional async callback for logging
        cancel_check: Optional function to check if cancelled
        
    Returns:
        Tuple of (success: bool, message: str, rows_added: int)
    """
    async def log(msg: str):
        if log_callback:
            await log_callback(msg)
    
    if not GSPREAD_AVAILABLE:
        error_msg = "gspread is not installed. Please install: pip install gspread"
        await log(f"❌ {error_msg}")
        return False, error_msg, 0
    
    sheet_id = sheets_config.get('sheet_id')
    tab_name = sheets_config.get('tab_name', 'Products')
    credentials_json_base64 = sheets_config.get('credentials_json_base64')
    
    if not all([sheet_id, credentials_json_base64]):
        error_msg = "Missing Google Sheets configuration (sheet_id or credentials_json_base64)"
        await log(f"❌ {error_msg}")
        return False, error_msg, 0
    
    # Decode credentials from base64
    try:
        credentials_json = base64.b64decode(credentials_json_base64).decode('utf-8')
        credentials_dict = json.loads(credentials_json)
    except Exception as e:
        error_msg = f"Invalid credentials_json_base64: {str(e)}"
        await log(f"❌ {error_msg}")
        return False, error_msg, 0
    
    # Write credentials to temporary file (gspread requires file path)
    temp_creds_file = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(credentials_dict, f)
            temp_creds_file = f.name
        
        await log(f"📊 Connecting to Google Sheets (Sheet ID: {sheet_id})...")
        
        # Initialize gspread client
        gc = gspread.service_account(filename=temp_creds_file)
        spreadsheet = gc.open_by_key(sheet_id)
        
        # Get or create worksheet
        try:
            sheet = spreadsheet.worksheet(tab_name)
            await log(f"✅ Found tab '{tab_name}'")
        except WorksheetNotFound:
            available_tabs = [ws.title for ws in spreadsheet.worksheets()]
            await log(f"⚠️ Tab '{tab_name}' not found.")
            await log(f"📋 Available tabs: {', '.join(available_tabs) if available_tabs else '(no tabs)'}")
            
            try:
                await log(f"🔄 Creating new tab '{tab_name}'...")
                sheet = spreadsheet.add_worksheet(title=tab_name, rows=1000, cols=20)
                await log(f"✅ Created new tab '{tab_name}'")
            except Exception as create_error:
                error_msg = (
                    f"Tab '{tab_name}' does not exist and cannot be created.\n"
                    f"Available tabs: {', '.join(available_tabs) if available_tabs else '(none)'}\n"
                    f"Error: {str(create_error)}"
                )
                await log(f"❌ {error_msg}")
                return False, error_msg, 0
        
        # Prepare headers
        headers = [
            'ID', 'Item Group ID', 'Title', 'Description', 'Link',
            'Image Link', 'additional_image_link',
            'Brand', 'Google Product Category', 'Sale Price', 'Price', 'Availability', 'MPN', 'Condition', 'Product Type',
            'Color', 'Size', 'Gender', 'Age Group'
        ]
        
        rows = [headers]
        
        # Build rows from products
        for i, product in enumerate(products_data):
            if cancel_check and cancel_check():
                await log("ℹ️ Google Sheets export cancelled.")
                return False, "Cancelled", 0
            
            color = product.get('color', '')
            if not color or color.strip() == '':
                color = 'Multi Color'
            
            size = product.get('size', '')
            if not size or size.strip() == '':
                size = 'One Size'
            
            additional_images = product.get('additional_images', []) or []
            
            # MPN should already be set by adapter
            mpn = product.get('mpn', '')
            if not mpn:
                from urllib.parse import urlparse
                parsed_url = urlparse(config.store_url)
                domain_name = parsed_url.netloc.lower()
                domain_parts = domain_name.split('.')
                if len(domain_parts) >= 2:
                    domain_name = domain_parts[-2]
                else:
                    domain_name = 'store'
                mpn = f'{domain_name}_{product.get("id", "")}'
            
            description = product.get('description', '')
            
            # Base row (no additional_image_link)
            base_row = [
                str(product.get('id', '')),
                str(product.get('item_group_id', '')),
                product.get('title', ''),
                description,
                product.get('link', ''),
                product.get('image_link', ''),
                '',  # additional_image_link empty for base row
                config.store_name,
                config.google_shopping_category_id,
                _format_sale_price(product.get('sale_price')),
                f"{product.get('regular_price', 0.0):.2f} USD",
                product.get('availability', ''),
                mpn,
                product.get('condition', 'new'),
                product.get('product_type', ''),
                color,
                size,
                config.gender or '',
                config.age_group or ''
            ]
            rows.append(base_row)
            
            # One row per additional image
            for add_img in additional_images:
                if not add_img:
                    continue
                row_img = [
                    str(product.get('id', '')),
                    str(product.get('item_group_id', '')),
                    product.get('title', ''),
                    description,
                    product.get('link', ''),
                    product.get('image_link', ''),
                    add_img,
                    config.store_name,
                    config.google_shopping_category_id,
                    _format_sale_price(product.get('sale_price')),
                    f"{product.get('regular_price', 0.0):.2f} USD",
                    product.get('availability', ''),
                    mpn,
                    product.get('condition', 'new'),
                    product.get('product_type', ''),
                    color,
                    size,
                    config.gender or '',
                    config.age_group or ''
                ]
                rows.append(row_img)
            
            if (i + 1) % 100 == 0:
                await log(f"📦 Prepared {i + 1}/{len(products_data)} products")
        
        # Check existing data
        existing_data = sheet.get_all_values()
        
        if len(existing_data) <= 1:  # Only headers or empty
            # Empty sheet, add headers and data
            sheet.update('A1', rows)
            rows_added = len(rows) - 1  # Exclude header
            await log(f"✅ Created new sheet and pushed {len(products_data)} products ({rows_added} rows)")
            return True, f"Created new sheet and pushed {len(products_data)} products", rows_added
        else:
            # Has existing data, append new rows (deduplicate by ID + additional_image_link)
            existing_pairs = set()
            if len(existing_data) > 1:
                try:
                    header_row = existing_data[0]
                    add_idx = header_row.index('additional_image_link')
                except ValueError:
                    add_idx = 6  # Default column index
                
                for row in existing_data[1:]:
                    if not row:
                        continue
                    current_id = row[0] if len(row) > 0 else ''
                    current_add = row[add_idx] if len(row) > add_idx else ''
                    if current_id:
                        existing_pairs.add((current_id, current_add))
            
            new_rows = []
            for product in products_data:
                if cancel_check and cancel_check():
                    return False, "Cancelled", 0
                
                product_id = str(product.get('id', ''))
                if not product_id:
                    continue
                
                color = product.get('color', '')
                if not color or color.strip() == '':
                    color = 'Multi Color'
                
                size = product.get('size', '')
                if not size or size.strip() == '':
                    size = 'One Size'
                
                mpn = product.get('mpn', '')
                if not mpn:
                    from urllib.parse import urlparse
                    parsed_url = urlparse(config.store_url)
                    domain_name = parsed_url.netloc.lower()
                    domain_parts = domain_name.split('.')
                    if len(domain_parts) >= 2:
                        domain_name = domain_parts[-2]
                    else:
                        domain_name = 'store'
                    mpn = f'{domain_name}_{product.get("id", "")}'
                
                description = product.get('description', '')
                
                # 1) Base row (additional_image_link empty)
                if (product_id, '') not in existing_pairs:
                    base_row = [
                        product_id,
                        str(product.get('item_group_id', '')),
                        product.get('title', ''),
                        description,
                        product.get('link', ''),
                        product.get('image_link', ''),
                        '',
                        config.store_name,
                        config.google_shopping_category_id,
                        _format_sale_price(product.get('sale_price')),
                        f"{product.get('regular_price', 0.0):.2f} USD",
                        product.get('availability', ''),
                        mpn,
                        product.get('condition', 'new'),
                        product.get('product_type', ''),
                        color,
                        size,
                        config.gender or '',
                        config.age_group or ''
                    ]
                    new_rows.append(base_row)
                
                # 2) One row per additional image
                additional_images = product.get('additional_images', []) or []
                for add_img in additional_images:
                    if not add_img:
                        continue
                    if (product_id, add_img) in existing_pairs:
                        continue
                    row_img = [
                        product_id,
                        str(product.get('item_group_id', '')),
                        product.get('title', ''),
                        description,
                        product.get('link', ''),
                        product.get('image_link', ''),
                        add_img,
                        config.store_name,
                        config.google_shopping_category_id,
                        _format_sale_price(product.get('sale_price')),
                        f"{product.get('regular_price', 0.0):.2f} USD",
                        product.get('availability', ''),
                        mpn,
                        product.get('condition', 'new'),
                        product.get('product_type', ''),
                        color,
                        size,
                        config.gender or '',
                        config.age_group or ''
                    ]
                    new_rows.append(row_img)
            
            # Append new rows
            if new_rows:
                next_row = len(existing_data) + 1
                sheet.update(f'A{next_row}', new_rows)
                rows_added = len(new_rows)
                await log(f"✅ Appended {rows_added} new rows to Google Sheets")
                return True, f"Appended {rows_added} new rows", rows_added
            else:
                await log("ℹ️ No new rows to add (all already exist)")
                return True, "No new rows to add (all already exist)", 0
        
    except Exception as e:
        error_type = type(e).__name__
        error_msg = f"Error pushing to Google Sheets: {error_type}: {str(e)}"
        await log(f"❌ {error_msg}")
        
        import traceback
        await log(f"Traceback: {traceback.format_exc()}")
        return False, error_msg, 0
    
    finally:
        # Clean up temporary credentials file
        if temp_creds_file and os.path.exists(temp_creds_file):
            try:
                os.unlink(temp_creds_file)
            except:
                pass

