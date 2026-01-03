"""
BMSM (Buy More Save More) core operations.
Matching desktop app controller.py and models.py logic.
"""

import json
from typing import List, Dict, Optional, Tuple
from app.core.woo_client import WooClient
from app.core.bmsm_client import BmsmIndexClient
from app.schemas.bmsm import BMSMRulesSchema, BMSMRuleSchema


def parse_rules_from_meta(meta_data: List[Dict]) -> Tuple[bool, Dict, Optional[str]]:
    """
    Parse BMSM rules from WooCommerce product meta_data
    Returns: (success, rules_dict, error_message)
    Matching desktop app BMSMRules.from_product_meta logic EXACTLY
    Note: Desktop app silently ignores invalid JSON (leaves rules empty), but we return success=True
    """
    enabled = False
    rules_json = ""
    
    # Find BMSM meta entries
    for meta in meta_data:
        if isinstance(meta, dict):
            key = meta.get("key", "")
            value = meta.get("value", "")
            
            if key == "_bmsm_enabled":
                enabled = str(value).strip() == "1"
            elif key == "_bmsm_rules":
                rules_json = str(value).strip() if value else ""
    
    # Parse rules JSON (matching desktop app logic - silently ignore invalid JSON)
    rules = []
    if rules_json and rules_json != "" and rules_json != "[]":
        try:
            rules_list = json.loads(rules_json)
            if isinstance(rules_list, list):
                for r in rules_list:
                    if isinstance(r, dict):
                        rules.append({
                            "min": int(r.get("min", 2)),
                            "rate": float(r.get("rate", 0.0))
                        })
        except (json.JSONDecodeError, TypeError, ValueError):
            # Invalid JSON, leave rules empty (matching desktop app behavior)
            pass
    
    return True, {
        "enabled": enabled,
        "rules": rules
    }, None


def serialize_rules_to_meta(rules: BMSMRulesSchema) -> List[Dict]:
    """
    Convert BMSM rules to WooCommerce meta_data entries
    Returns: List of meta dicts with 'key' and 'value' fields
    Matching desktop app BMSMRules.to_meta_entries logic
    """
    entries = []
    
    # Serialize rules to JSON string
    if rules.rules:
        rules_list = [{"min": rule.min, "rate": rule.rate} for rule in sorted(rules.rules, key=lambda r: r.min)]
        rules_json = json.dumps(rules_list)
    else:
        rules_json = ""
    
    entries.append({
        "key": "_bmsm_enabled",
        "value": "1" if rules.enabled else "0"
    })
    entries.append({
        "key": "_bmsm_rules",
        "value": rules_json
    })
    
    return entries


def upsert_meta(meta_data: List[Dict], key: str, value: any) -> List[Dict]:
    """
    Upsert a meta entry in meta_data list
    Returns: Updated meta_data list
    Matching desktop app ProductApiClient.upsert_meta logic
    """
    updated_meta = []
    found = False
    
    # Update existing entry if found
    for meta in meta_data:
        if isinstance(meta, dict) and meta.get("key") == key:
            # Update existing
            updated_meta.append({"key": key, "value": value})
            found = True
        else:
            # Preserve other entries
            updated_meta.append(meta)
    
    # Append new entry if not found
    if not found:
        updated_meta.append({"key": key, "value": value})
    
    return updated_meta


async def get_product_rules(
    woo_client: WooClient,
    product_id: int
) -> Tuple[bool, Optional[Dict], Optional[str], Optional[str]]:
    """
    Get BMSM rules for a product
    Returns: (success, rules_dict, product_name, error_message)
    Matching desktop app controller.load_product_rules logic
    """
    try:
        product_data = await woo_client.get_product(product_id)
        
        # Extract product name
        product_name = product_data.get("name", f"Product #{product_id}")
        
        # Parse BMSM rules from meta_data
        meta_data = product_data.get("meta_data", [])
        success, rules_dict, error = parse_rules_from_meta(meta_data)
        
        if not success:
            return False, None, product_name, error
        
        return True, rules_dict, product_name, None
        
    except Exception as e:
        return False, None, None, f"Error loading product rules: {str(e)}"


async def save_product_rules(
    woo_client: WooClient,
    product_id: int,
    rules: BMSMRulesSchema
) -> Tuple[bool, Optional[Dict], Optional[str]]:
    """
    Save BMSM rules for a product
    Returns: (success, updated_product_data, error_message)
    Matching desktop app controller.save_product_rules logic
    """
    try:
        # Step 1: Get current product data with meta_data
        product_data = await woo_client.get_product(product_id)
        
        # Step 2: Get existing meta_data
        existing_meta = product_data.get("meta_data", [])
        if not isinstance(existing_meta, list):
            existing_meta = []
        
        # Step 3: Convert rules to meta entries
        new_meta_entries = serialize_rules_to_meta(rules)
        
        # Step 4: Upsert each new meta entry
        updated_meta = existing_meta.copy()
        for new_entry in new_meta_entries:
            key = new_entry.get("key")
            value = new_entry.get("value")
            if key:
                updated_meta = upsert_meta(updated_meta, key, value)
        
        # Step 5: Update product meta_data
        update_data = {
            "meta_data": updated_meta
        }
        
        updated_product = await woo_client.update_product(product_id, update_data)
        
        return True, updated_product, None
        
    except Exception as e:
        return False, None, f"Error saving product rules: {str(e)}"


async def search_products(
    woo_client: WooClient,
    query: str = "",
    page: int = 1,
    per_page: int = 20,
    fields: Optional[List[str]] = None
) -> Tuple[bool, List[Dict], Optional[str], int]:
    """
    Search products by keyword/SKU/ID
    Returns: (success, products_list, error_message, total)
    Matching desktop app ProductApiClient.search_products logic
    
    Note: WooClient.get_products uses consumer_key/secret which typically has edit context
    """
    try:
        result = await woo_client.get_products(
            page=page,
            per_page=per_page,
            search=query if query else None
        )
        
        products = result.get("items", [])
        total = result.get("total", len(products))
        
        # Filter fields if specified (client-side filtering)
        if fields:
            filtered_products = []
            for product in products:
                filtered_product = {k: v for k, v in product.items() if k in fields}
                filtered_products.append(filtered_product)
            products = filtered_products
        
        return True, products, None, total
        
    except Exception as e:
        return False, [], f"Error searching products: {str(e)}", 0


async def get_inventory_index(
    index_client: BmsmIndexClient,
    page: int = 1,
    per_page: int = 50,
    search: str = "",
    filter_type: str = "all"
) -> Tuple[bool, List[Dict], int, Optional[str]]:
    """
    Get BMSM inventory index
    Returns: (success, items_list, total_count, error_message)
    Matching desktop app inventory_service.load_index logic
    """
    success, items, total, error = await index_client.get_index(
        page=page,
        per_page=per_page,
        search=search,
        filter_type=filter_type
    )
    
    if not success:
        return False, [], 0, error
    
    # Convert index items to inventory row format
    inventory_rows = []
    for item in items:
        product_id = item.get("id", 0)
        name = item.get("name", f"Product #{product_id}")
        product_type = item.get("type", "simple")
        enabled = item.get("enabled", False)
        tier_count = item.get("tier_count", 0)
        max_percent = item.get("max_percent")
        min_qty_min = item.get("min_qty_min")
        min_qty_max = item.get("min_qty_max")
        status = item.get("status", "empty_rules")
        
        # Build min_qty_range display
        if min_qty_min is not None:
            if min_qty_max is not None and min_qty_max != min_qty_min:
                min_qty_range = f"{min_qty_min}-{min_qty_max}"
            else:
                min_qty_range = str(min_qty_min)
        else:
            min_qty_range = "-"
        
        # Map status
        if status == "invalid_json":
            validity_status = "invalid"
        elif status == "empty_rules":
            validity_status = "empty"
        elif status == "valid":
            validity_status = "valid"
        else:
            validity_status = "missing"
        
        inventory_rows.append({
            "product_id": product_id,
            "name": name,
            "type": product_type,
            "enabled": enabled,
            "tier_count": tier_count,
            "max_discount_percent": max_percent,
            "min_qty_range": min_qty_range,
            "validity_status": validity_status
        })
    
    return True, inventory_rows, total, None


async def get_all_inventory_index(
    index_client: BmsmIndexClient,
    search: str = "",
    filter_type: str = "all"
) -> Tuple[bool, List[Dict], Optional[str]]:
    """
    Get ALL BMSM inventory index (no pagination, fetches all pages)
    Returns: (success, items_list, error_message)
    """
    all_inventory_rows = []
    page = 1
    per_page = 100  # Use larger page size for efficiency
    
    while True:
        success, items, total, error = await index_client.get_index(
            page=page,
            per_page=per_page,
            search=search,
            filter_type=filter_type
        )
        
        if not success:
            return False, [], error
        
        if not items:
            break
        
        # Convert index items to inventory row format
        for item in items:
            product_id = item.get("id", 0)
            name = item.get("name", f"Product #{product_id}")
            product_type = item.get("type", "simple")
            enabled = item.get("enabled", False)
            tier_count = item.get("tier_count", 0)
            max_percent = item.get("max_percent")
            min_qty_min = item.get("min_qty_min")
            min_qty_max = item.get("min_qty_max")
            status = item.get("status", "empty_rules")
            
            # Build min_qty_range display
            if min_qty_min is not None:
                if min_qty_max is not None and min_qty_max != min_qty_min:
                    min_qty_range = f"{min_qty_min}-{min_qty_max}"
                else:
                    min_qty_range = str(min_qty_min)
            else:
                min_qty_range = "-"
            
            # Map status
            if status == "invalid_json":
                validity_status = "invalid"
            elif status == "empty_rules":
                validity_status = "empty"
            elif status == "valid":
                validity_status = "valid"
            else:
                validity_status = "missing"
            
            all_inventory_rows.append({
                "product_id": product_id,
                "name": name,
                "type": product_type,
                "enabled": enabled,
                "tier_count": tier_count,
                "max_discount_percent": max_percent,
                "min_qty_range": min_qty_range,
                "validity_status": validity_status
            })
        
        # If we got less than per_page, we're done
        if len(items) < per_page:
            break
        
        page += 1
    
    return True, all_inventory_rows, None


def build_inventory_summary(inventory_rows: List[Dict]) -> Dict[str, int]:
    """
    Build inventory summary statistics
    Returns: Dict with counts
    Matching desktop app inventory_service.get_inventory_summary logic
    """
    enabled = sum(1 for r in inventory_rows if r.get("enabled", False))
    disabled = len(inventory_rows) - enabled
    with_rules = sum(1 for r in inventory_rows if r.get("tier_count", 0) > 0)
    invalid = sum(1 for r in inventory_rows if r.get("validity_status") == "invalid")
    
    return {
        "scanned": len(inventory_rows),
        "enabled": enabled,
        "disabled": disabled,
        "with_rules": with_rules,
        "invalid": invalid
    }

