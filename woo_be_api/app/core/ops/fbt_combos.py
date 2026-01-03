"""
FBT Combos core operations.
Matching desktop app controller.py and api_client.py logic exactly.
"""

from typing import List, Dict, Optional, Tuple
from app.core.fbt_client import FBTAPIClient
from app.core.woo_client import WooClient
from app.schemas.fbt_combos import (
    ComboBaseSchema, ComboResponse, DiscountRuleSchema, ProductLiteSchema
)


def validate_discount_rule(min_items: int, rate: float) -> Tuple[bool, Optional[str]]:
    """
    Validate discount rule
    Returns: (is_valid, error_message)
    Matching desktop app utils.validate_discount_rule
    """
    if min_items < 2:
        return False, "Minimum items must be >= 2"
    if rate <= 0:
        return False, "Discount rate must be > 0"
    if rate > 0.95:
        return False, "Discount rate must be <= 95% (0.95)"
    return True, None


def validate_combo(combo_data: Dict) -> Optional[str]:
    """
    Validate combo before saving with Apply Scope support
    Returns: error_message or None if valid
    Matching desktop app controller.validate_combo logic EXACTLY
    """
    # Sync legacy fields first (like desktop app Combo._sync_legacy_fields)
    combo_data = migrate_combo_data(combo_data.copy())
    
    # Validate apply_scope
    apply_scope = combo_data.get("apply_scope", "main_only")
    if apply_scope not in ("main_only", "all_in_combo"):
        return f"Invalid apply_scope: {apply_scope}. Must be 'main_only' or 'all_in_combo'"
    
    # Get product_ids (already migrated)
    product_ids = combo_data.get("product_ids", [])
    
    # Validate product_ids (must have at least 2 unique products)
    if len(product_ids) < 2:
        return "Combo must contain at least 2 unique products"
    
    # Check for duplicates in product_ids
    if len(product_ids) != len(set(product_ids)):
        return "Duplicate products in product_ids"
    
    # Validate main_ids based on scope
    if apply_scope == "main_only":
        main_ids = combo_data.get("main_ids", [])
        if not main_ids:
            return "main_only scope requires at least one main product"
        
        # Each main_id must exist in product_ids
        product_ids_set = set(product_ids)
        for main_id in main_ids:
            if main_id not in product_ids_set:
                return f"Main ID {main_id} must be included in product_ids"
        
        # Check for duplicates in main_ids
        if len(main_ids) != len(set(main_ids)):
            return "Duplicate products in main_ids"
    
    # For all_in_combo: main_ids can be empty (all products act as mains)
    # No additional validation needed
    
    # Validate discount rules
    discount_rules = combo_data.get("discount_rules", [])
    for rule in discount_rules:
        if isinstance(rule, dict):
            min_items = rule.get("min", 0)
            rate = rule.get("rate", 0.0)
        else:
            # Assume it's a DiscountRuleSchema object
            min_items = getattr(rule, "min", 2)
            rate = getattr(rule, "rate", 0.0)
        
        is_valid, error = validate_discount_rule(min_items, rate)
        if not is_valid:
            return f"Invalid discount rule: {error}"
    
    return None


def migrate_combo_data(combo_data: Dict) -> Dict:
    """
    Migrate legacy combo format to new format
    Matching desktop app models.Combo.from_dict migration logic EXACTLY
    """
    # Get apply_scope (default to main_only for backward compatibility)
    apply_scope = combo_data.get("apply_scope", "main_only")
    
    # Get product_ids (migrate from legacy if needed)
    product_ids = combo_data.get("product_ids", [])
    main_id = combo_data.get("main_id", 0)
    combo_ids = combo_data.get("combo_ids", [])
    
    # Migration: Build product_ids from legacy fields if not present
    if not product_ids:
        all_ids = set()
        if main_id:
            all_ids.add(main_id)
        all_ids.update(combo_ids)
        product_ids = sorted(list(all_ids))
        combo_data["product_ids"] = product_ids
    
    # Get main_ids
    main_ids = combo_data.get("main_ids", [])
    
    # Migration: Build main_ids from main_id if not present
    if not main_ids and main_id:
        main_ids = [main_id]
        combo_data["main_ids"] = main_ids
    
    # Ensure main_id is set (required by ComboResponse)
    if not combo_data.get("main_id"):
        if main_ids:
            combo_data["main_id"] = main_ids[0]
        elif product_ids:
            combo_data["main_id"] = product_ids[0]
        else:
            combo_data["main_id"] = 0
    
    # Calculate combo_ids (product_ids - main_ids) for backward compatibility
    if not combo_data.get("combo_ids"):
        main_ids_set = set(main_ids) if main_ids else set()
        if main_id:
            main_ids_set.add(main_id)
        combo_ids = [pid for pid in product_ids if pid not in main_ids_set]
        combo_data["combo_ids"] = combo_ids
    
    # Ensure discount_rules is a list of dicts
    discount_rules = combo_data.get("discount_rules", [])
    if discount_rules:
        normalized_rules = []
        for rule in discount_rules:
            if isinstance(rule, dict):
                normalized_rules.append(rule)
            else:
                # If it's an object with min/rate attributes
                normalized_rules.append({
                    "min": getattr(rule, "min", rule.get("min", 2) if hasattr(rule, "get") else 2),
                    "rate": getattr(rule, "rate", rule.get("rate", 0.0) if hasattr(rule, "get") else 0.0)
                })
        combo_data["discount_rules"] = normalized_rules
    else:
        combo_data["discount_rules"] = []
    
    # Ensure all required fields have defaults
    combo_data.setdefault("enabled", True)
    combo_data.setdefault("apply_scope", "main_only")
    combo_data.setdefault("priority", 0)
    combo_data.setdefault("main_name", None)
    combo_data.setdefault("updated_at", None)
    
    return combo_data


async def list_combos(
    fbt_client: FBTAPIClient,
    search: str = "",
    page: int = 1,
    per_page: int = 50
) -> Tuple[bool, List[Dict], Optional[str]]:
    """
    List combos with pagination and search
    Returns: (success, combos_list, error_message)
    Matching desktop app controller.load_combos_list logic EXACTLY
    Note: Desktop app returns raw dicts from API, migration happens in models.Combo.from_dict()
    But for backend API, we migrate here to ensure consistent format for schema validation
    """
    success, combos, error = await fbt_client.list_combos(search, page, per_page)
    
    if not success:
        return False, [], error
    
    # Migrate each combo to new format (for consistent schema validation)
    migrated_combos = []
    for combo in combos:
        migrated = migrate_combo_data(combo)
        migrated_combos.append(migrated)
    
    return True, migrated_combos, None


async def list_all_combos(
    fbt_client: FBTAPIClient,
    search: str = ""
) -> Tuple[bool, List[Dict], Optional[str]]:
    """
    List ALL combos (no pagination, fetches all pages)
    Returns: (success, combos_list, error_message)
    """
    all_combos = []
    page = 1
    per_page = 100  # Use larger page size for efficiency
    
    while True:
        success, combos, error = await list_combos(fbt_client, search, page, per_page)
        
        if not success:
            return False, [], error
        
        if not combos:
            break
        
        all_combos.extend(combos)
        
        # If we got less than per_page, we're done
        if len(combos) < per_page:
            break
        
        page += 1
    
    return True, all_combos, None


async def get_combo(
    fbt_client: FBTAPIClient,
    main_id: int
) -> Tuple[bool, Optional[Dict], Optional[str]]:
    """
    Get combo details by main_id
    Returns: (success, combo_dict, error_message)
    Matching desktop app controller.load_combo_details logic
    Note: Desktop app FBTAPIClient.get_combo returns Combo object (migrated in models.Combo.from_dict)
    But backend fbt_client returns raw dict, so we migrate here
    """
    success, combo_data, error = await fbt_client.get_combo(main_id)
    
    if not success:
        return False, None, error
    
    # Migrate to new format
    migrated = migrate_combo_data(combo_data)
    
    return True, migrated, None


async def save_combo(
    fbt_client: FBTAPIClient,
    combo_data: Dict
) -> Tuple[bool, Optional[str]]:
    """
    Save combo (create or update)
    Returns: (success, error_message)
    Matching desktop app controller.save_combo logic EXACTLY
    """
    # Migrate to new format first
    migrated = migrate_combo_data(combo_data.copy())
    
    # Apply desktop app save logic (matching ui.py _on_save_combo)
    apply_scope = migrated.get("apply_scope", "main_only")
    product_ids = migrated.get("product_ids", [])
    main_ids = migrated.get("main_ids", [])
    main_id = migrated.get("main_id", 0)
    combo_ids = migrated.get("combo_ids", [])
    
    # Desktop app logic: Sync product_ids from main_ids + combo_ids
    # If product_ids is provided, use it; otherwise build from main_ids + combo_ids
    if not product_ids or len(product_ids) == 0:
        all_product_ids = set()
        # Add all main_ids
        if main_ids:
            all_product_ids.update(main_ids)
        elif main_id:
            all_product_ids.add(main_id)
        # Add all combo_ids (upsell items)
        if combo_ids:
            all_product_ids.update(combo_ids)
        product_ids = sorted(list(all_product_ids))
        migrated["product_ids"] = product_ids
    
    # Desktop app logic: For all_in_combo, set main_ids = product_ids
    if apply_scope == "all_in_combo":
        migrated["main_ids"] = product_ids.copy()
        # Set main_id to first product for backward compatibility
        if product_ids:
            migrated["main_id"] = product_ids[0]
        # combo_ids should be empty (all products are mains)
        migrated["combo_ids"] = []
    else:
        # For main_only: ensure main_ids is set correctly
        if not main_ids and main_id:
            migrated["main_ids"] = [main_id]
        # Calculate combo_ids = product_ids - main_ids
        main_ids_set = set(migrated.get("main_ids", []))
        if main_id:
            main_ids_set.add(main_id)
        combo_ids_calculated = [pid for pid in product_ids if pid not in main_ids_set]
        migrated["combo_ids"] = combo_ids_calculated
    
    # Validate combo after sync
    validation_error = validate_combo(migrated)
    if validation_error:
        return False, validation_error
    
    # Save via API
    success, error = await fbt_client.save_combo(migrated)
    
    return success, error


async def delete_combo(
    fbt_client: FBTAPIClient,
    main_id: int
) -> Tuple[bool, Optional[str]]:
    """
    Delete combo by main_id
    Returns: (success, error_message)
    Matching desktop app controller.delete_combo logic
    """
    success, error = await fbt_client.delete_combo(main_id)
    return success, error


async def search_products(
    woo_client: WooClient,
    query: str,
    per_page: int = 20,
    page: int = 1
) -> Tuple[bool, List[Dict], Optional[str], int]:
    """
    Search products by name/SKU/ID
    Returns: (success, products_list, error_message, total)
    Matching desktop app ProductSearchClient.search_products logic
    Note: Desktop app returns (success, List[ProductLite], error), but backend needs total for pagination
    """
    # Validate query length (matching desktop app logic)
    query = query.strip()
    if not query:
        return True, [], None, 0
    
    # Only search if query length >= 3 OR if it's numeric (ID search)
    if len(query) < 3 and not query.isdigit():
        return True, [], None, 0
    
    # If query is numeric, try direct ID lookup first
    if query.isdigit():
        product_id = int(query)
        try:
            product = await woo_client.get_product(product_id)
            if product:
                # Convert to ProductLite format
                product_lite = {
                    "id": product.get("id", 0),
                    "name": product.get("name", f"Product #{product.get('id', 0)}"),
                    "type": product.get("type", "simple"),
                    "price": product.get("regular_price") or product.get("price", ""),
                    "stock_status": product.get("stock_status", "instock")
                }
                return True, [product_lite], None, 1
        except:
            # Product not found, continue with regular search
            pass
    
    # Regular search
    try:
        result = await woo_client.get_products(page=page, per_page=per_page, search=query)
        products = result.get("items", [])
        total = result.get("total", len(products))
        
        # Convert to ProductLite format
        products_lite = []
        for product in products:
            products_lite.append({
                "id": product.get("id", 0),
                "name": product.get("name", f"Product #{product.get('id', 0)}"),
                "type": product.get("type", "simple"),
                "price": product.get("regular_price") or product.get("price", ""),
                "stock_status": product.get("stock_status", "instock")
            })
        
        return True, products_lite, None, total
        
    except Exception as e:
        return False, [], f"Error searching products: {str(e)}", 0


async def resolve_recommendations(
    fbt_client: FBTAPIClient,
    product_id: int
) -> Tuple[bool, Optional[Dict], Optional[str]]:
    """
    Resolve combo recommendations for a product
    Returns: (success, recommendations_dict, error_message)
    Matching desktop app README_SCOPE.md resolver logic EXACTLY
    """
    # Get all combos (fetch all pages)
    success, combos, error = await list_all_combos(fbt_client, search="")
    
    if not success:
        return False, None, error
    
    # Find matching combos
    matching_combos = []
    for combo in combos:
        apply_scope = combo.get("apply_scope", "main_only")
        product_ids = set(combo.get("product_ids", []))
        main_ids = set(combo.get("main_ids", []))
        
        # Match logic (matching desktop app resolver)
        is_match = False
        if apply_scope == "main_only":
            is_match = product_id in main_ids
        elif apply_scope == "all_in_combo":
            is_match = product_id in product_ids
        
        if is_match:
            matching_combos.append(combo)
    
    if not matching_combos:
        return True, {
            "combo_id": None,
            "recommended_product_ids": [],
            "discount_rules": []
        }, None
    
    # Select best combo (highest priority, then newest, then smallest group)
    best_combo = None
    best_score = (-float('inf'), None, float('inf'))
    
    for combo in matching_combos:
        priority = combo.get("priority", 0)
        updated_at = combo.get("updated_at")
        product_ids = combo.get("product_ids", [])
        group_size = len(product_ids)
        
        # Score: (priority, updated_at timestamp, -group_size for smaller is better)
        updated_timestamp = 0
        if updated_at:
            try:
                from datetime import datetime
                # Handle ISO format with or without timezone
                dt_str = updated_at.replace('Z', '+00:00') if updated_at.endswith('Z') else updated_at
                dt = datetime.fromisoformat(dt_str)
                updated_timestamp = dt.timestamp()
            except:
                pass
        
        score = (priority, updated_timestamp, -group_size)
        if score > best_score:
            best_score = score
            best_combo = combo
    
    if not best_combo:
        return True, {
            "combo_id": None,
            "recommended_product_ids": [],
            "discount_rules": []
        }, None
    
    # Get recommendations (all products except current)
    product_ids = set(best_combo.get("product_ids", []))
    recommended_ids = sorted(list(product_ids - {product_id}))
    
    # Get discount rules
    discount_rules = best_combo.get("discount_rules", [])
    
    return True, {
        "combo_id": best_combo.get("main_id"),
        "recommended_product_ids": recommended_ids,
        "discount_rules": discount_rules
    }, None
