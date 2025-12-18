"""
Product editor operations - fetch and update product details.
"""

import re
import unicodedata
from typing import Optional, Dict, Any, List, Set
from urllib.parse import urlparse
from app.core.woo_client import WooClient
from app.core.wp_client import WPClient

# Size ordering for sorting variations
SIZE_ORDER = ["s", "m", "l", "xl", "2xl", "3xl", "4xl", "5xl"]


def normalize_text_for_matching(text: str) -> str:
    """Normalize text for case-insensitive and accent-insensitive matching."""
    if not text:
        return ""
    normalized = unicodedata.normalize('NFD', text.lower().strip())
    normalized = ''.join(c for c in normalized if unicodedata.category(c) != 'Mn')
    normalized = normalized.replace(' ', '_').replace('-', '_').replace('/', '_')
    return normalized


def normalize_size(value: str) -> str:
    """
    Normalize size value to lowercase and strip whitespace.
    
    Args:
        value: Size string (e.g., "XL", " 2xl ", "M")
    
    Returns:
        Normalized size string (e.g., "xl", "2xl", "m")
    """
    if not value:
        return ""
    return value.lower().strip()


def size_rank(value: str) -> int:
    """
    Get rank/position of a size in SIZE_ORDER.
    
    Args:
        value: Size string (e.g., "xl", "2xl")
    
    Returns:
        Index in SIZE_ORDER, or len(SIZE_ORDER) if not found
    """
    normalized = normalize_size(value)
    try:
        return SIZE_ORDER.index(normalized)
    except ValueError:
        return len(SIZE_ORDER)


def _abbr_color(text: str, max_len: int = 6) -> str:
    """
    Abbreviate color text by taking first letter of each word.
    
    Examples:
        "Light Pink" -> "LP"
        "Navy Blue" -> "NB"
        "Red" -> "R"
        "Dark Navy Blue" -> "DNB"
    
    Args:
        text: Color text
        max_len: Maximum length of abbreviation (default 6)
    
    Returns:
        Uppercase abbreviation
    """
    if not text:
        return ""
    
    # Split by whitespace, hyphen, underscore
    tokens = re.split(r'[\s\-_]+', text.strip())
    
    # Take first letter of each token
    abbr = ''.join(token[0].upper() for token in tokens if token)
    
    # Limit length
    if len(abbr) > max_len:
        abbr = abbr[:max_len]
    
    return abbr


def _sanitize_token(text: str, max_len: int = 20) -> str:
    """
    Sanitize text for use in SKU token.
    
    - Uppercase
    - Replace spaces/invalid chars with "-"
    - Keep only A-Z0-9 and hyphen
    
    Args:
        text: Text to sanitize
        max_len: Maximum length (default 20)
    
    Returns:
        Sanitized token
    """
    if not text:
        return ""
    
    # Uppercase
    sanitized = text.upper().strip()
    
    # Replace spaces, invalid chars with hyphen
    sanitized = re.sub(r'[^A-Z0-9]', '-', sanitized)
    
    # Remove consecutive hyphens
    sanitized = re.sub(r'-+', '-', sanitized)
    
    # Remove leading/trailing hyphens
    sanitized = sanitized.strip('-')
    
    # Limit length
    if len(sanitized) > max_len:
        sanitized = sanitized[:max_len]
    
    return sanitized


def generate_variation_sku(product_id: int, size_value: str, color_value: str, existing_skus: Set[str]) -> str:
    """
    Generate a unique SKU for a variation.
    
    Format: {product_id}-{SIZE}-{COLOR}
    
    Args:
        product_id: Numeric ID of parent product
        size_value: Size value (e.g., "M", "XL", "2XL")
        color_value: Color value (e.g., "Light Pink", "Red")
        existing_skus: Set of existing SKUs (uppercase) to check uniqueness
    
    Returns:
        Generated SKU (uppercase)
    """
    if not size_value or not color_value:
        # Cannot generate SKU without size and color
        return ""
    
    # Normalize size - try to use known size order first
    size_normalized = normalize_size(size_value)
    # If size is in SIZE_ORDER, use it as-is (already normalized)
    if size_normalized in SIZE_ORDER:
        size_token = size_normalized.upper()
    else:
        # Unknown size, sanitize the raw text
        size_token = _sanitize_token(size_value, max_len=10)
    
    # Abbreviate color
    color_token = _abbr_color(color_value, max_len=6)
    
    if not size_token or not color_token:
        return ""
    
    # Build base SKU
    base_sku = f"{product_id}-{size_token}-{color_token}"
    
    # Check uniqueness
    base_sku_upper = base_sku.upper()
    if base_sku_upper not in existing_skus:
        return base_sku_upper
    
    # Collision detected - try with suffix
    suffix = 2
    while True:
        candidate = f"{base_sku_upper}-{suffix}"
        if candidate not in existing_skus:
            return candidate
        suffix += 1
        # Safety limit
        if suffix > 999:
            break
    
    # Fallback (should not happen)
    return base_sku_upper


def extract_slug_from_url(url: str) -> Optional[str]:
    """Extract product slug from URL."""
    try:
        parsed = urlparse(url)
        path = parsed.path.rstrip("/")
        pattern = r"/product/([^/?#]+)/?$"
        match = re.search(pattern, path)
        if match:
            return match.group(1)
    except Exception:
        pass
    return None


async def fetch_product_for_editor(
    client: WooClient,
    product_url: Optional[str] = None,
    product_id: Optional[int] = None
) -> Optional[Dict[str, Any]]:
    """
    Fetch full product data for editing.
    
    Returns EditableProduct-like dict with:
    - Basic info (id, slug, name, short_description, description)
    - Attributes (with original_data)
    - Images (with id, src, alt, position)
    - Variations (with id, sku, attributes, prices, images)
    """
    # Get product
    product = None
    if product_id:
        product = await client.get_product(product_id)
    elif product_url:
        slug = extract_slug_from_url(product_url)
        if slug:
            product = await client.get_product_by_slug(slug)
    
    if not product:
        return None
    
    product_id = product.get("id")
    if not product_id:
        return None
    
    # Build editable product structure
    editable_product = {
        "id": product_id,
        "slug": product.get("slug", ""),
        "name": product.get("name", ""),
        "short_description": product.get("short_description", "") or "",
        "description": product.get("description", "") or "",
        "attributes": [],
        "images": [],
        "variations": []
    }
    
    # Parse attributes
    wc_attributes = product.get("attributes", [])
    attr_id_to_slug = {}
    
    for attr in wc_attributes:
        if not attr.get("variation"):  # Only variation attributes
            continue
        
        attr_name = attr.get("name", "")
        attr_options = attr.get("options", [])
        attr_id = attr.get("id")
        attr_slug_raw = attr.get("slug", "")
        
        # Determine editor slug
        is_custom = (attr_id == 0 or (isinstance(attr_id, str) and attr_id == "0"))
        
        if isinstance(attr_id, str) and attr_id.startswith("pa_"):
            editor_slug = attr_id
        elif attr_slug_raw and isinstance(attr_slug_raw, str) and attr_slug_raw.startswith("pa_"):
            editor_slug = attr_slug_raw
        elif attr_slug_raw:
            editor_slug = attr_slug_raw
        elif not is_custom and attr_id is not None:
            editor_slug = str(attr_id)
        else:
            editor_slug = normalize_text_for_matching(attr_name).replace("_", "-")
        
        # Store mapping
        if attr_id is not None and isinstance(attr_id, int) and attr_id > 0:
            attr_id_to_slug[str(attr_id)] = editor_slug
        if attr_slug_raw:
            attr_id_to_slug[attr_slug_raw] = editor_slug
        
        editable_product["attributes"].append({
            "name": attr_name,
            "slug": editor_slug,
            "options": attr_options if isinstance(attr_options, list) else [],
            "original_data": attr
        })
    
    # Parse images
    wc_images = product.get("images", [])
    for idx, img in enumerate(wc_images):
        editable_product["images"].append({
            "id": img.get("id"),
            "src": img.get("src", ""),
            "alt": img.get("alt", ""),
            "position": img.get("position", idx)
        })
    
    # Sort images by position
    editable_product["images"].sort(key=lambda x: x.get("position", 0))
    
    # Get variations if variable product
    if product.get("type") == "variable":
        variations_result = await client.get_variations(product_id, page=1, per_page=100)
        variations = variations_result.get("items", [])
        
        # Get all pages if needed
        total_pages = variations_result.get("total_pages", 1)
        for page in range(2, total_pages + 1):
            more_variations = await client.get_variations(product_id, page=page, per_page=100)
            variations.extend(more_variations.get("items", []))
        
        for var in variations:
            var_id = var.get("id")
            var_attrs = var.get("attributes", [])
            
            # Build attributes dict using editor slugs
            attrs_dict = {}
            for attr in var_attrs:
                attr_id = attr.get("id")
                attr_slug = attr.get("slug", "")
                attr_name = attr.get("name", "")
                attr_value = attr.get("option", "")
                
                if not attr_value:
                    continue
                
                editor_slug = None
                
                if attr_id != 0 and attr_id is not None:
                    editor_slug = attr_id_to_slug.get(str(attr_id))
                    if not editor_slug and isinstance(attr_id, str):
                        editor_slug = attr_id_to_slug.get(attr_id)
                
                if not editor_slug and attr_slug:
                    editor_slug = attr_id_to_slug.get(attr_slug)
                
                if not editor_slug and attr_id == 0 and attr_name:
                    name_slug = normalize_text_for_matching(attr_name)
                    editor_slug = attr_id_to_slug.get(name_slug)
                    if not editor_slug:
                        for ed_attr in editable_product["attributes"]:
                            if normalize_text_for_matching(ed_attr["name"]) == normalize_text_for_matching(attr_name):
                                editor_slug = ed_attr["slug"]
                                break
                
                if editor_slug:
                    attrs_dict[editor_slug] = attr_value
            
            # Get variation image
            var_image = var.get("image")
            image_id = None
            image_src = None
            if var_image and isinstance(var_image, dict):
                image_id = var_image.get("id")
                image_src = var_image.get("src", "")
            
            editable_product["variations"].append({
                "id": var_id,
                "sku": var.get("sku", "") or "",
                "attributes": attrs_dict,
                "regular_price": var.get("regular_price", "") or "",
                "sale_price": var.get("sale_price", "") or "",
                "image_id": image_id,
                "image_src": image_src,
                "status": "existing"
            })
    
    return editable_product


async def update_product_from_editor(
    client: WooClient,
    wp_client: Optional[WPClient],
    product_id: int,
    product_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Update product from editor data.
    
    Args:
        client: WooClient instance
        wp_client: WPClient instance (optional, for image uploads)
        product_id: Product ID
        product_data: EditableProduct-like dict
    
    Returns:
        Dict with update results
    """
    results = {
        "product_updated": False,
        "variations_created": 0,
        "variations_updated": 0,
        "variations_deleted": 0,
        "errors": []
    }
    
    try:
        # Build product update payload
        product_payload = {
            "name": product_data.get("name"),
            "short_description": product_data.get("short_description", ""),
            "description": product_data.get("description", "")
        }
        
        # Convert attributes
        if product_data.get("attributes"):
            wc_attributes = []
            for attr in product_data["attributes"]:
                if attr.get("original_data"):
                    attr_dict = attr["original_data"].copy()
                    attr_dict["options"] = attr.get("options", [])
                else:
                    attr_dict = {
                        "name": attr.get("name"),
                        "options": attr.get("options", []),
                        "variation": True,
                        "visible": True
                    }
                    if attr.get("slug"):
                        attr_dict["slug"] = attr["slug"]
                wc_attributes.append(attr_dict)
            product_payload["attributes"] = wc_attributes
        
        # Convert images (filter out deleted)
        if product_data.get("images"):
            images_to_delete = set(product_data.get("images_to_delete_media_ids", []))
            wc_images = []
            for img in sorted(product_data["images"], key=lambda x: x.get("position", 0)):
                if not img.get("delete_from_media") and img.get("id") not in images_to_delete:
                    wc_images.append({
                        "id": img.get("id"),
                        "position": img.get("position", 0)
                    })
            product_payload["images"] = wc_images
        
        # Update product
        await client.update_product(product_id, product_payload)
        results["product_updated"] = True
        
        # Handle variations
        variations = product_data.get("variations", [])
        if variations:
            # Build attribute mapping for variations
            attr_slug_to_id = {}
            attr_slug_to_name = {}
            attr_slug_to_obj = {}  # Map slug to attribute object for option updates
            for attr in product_data.get("attributes", []):
                original = attr.get("original_data", {})
                attr_id = original.get("id")
                if attr_id and isinstance(attr_id, int) and attr_id > 0:
                    attr_slug_to_id[attr["slug"]] = attr_id
                attr_slug_to_name[attr["slug"]] = attr["name"]
                attr_slug_to_obj[attr["slug"]] = attr
            
            # Infer attribute keys (size, color) for SKU generation
            size_key = None
            color_key = None
            for attr in product_data.get("attributes", []):
                slug_norm = normalize_text_for_matching(attr.get("slug", ""))
                name_norm = normalize_text_for_matching(attr.get("name", ""))
                if slug_norm in ["pa_size", "size"] or name_norm in ["size", "kich_co"]:
                    size_key = attr["slug"]
                elif slug_norm in ["pa_color", "color"] or name_norm in ["color", "mau"]:
                    color_key = attr["slug"]
            
            # Collect existing SKUs for uniqueness checking
            existing_skus = set()
            for var in variations:
                sku = var.get("sku", "")
                if sku and sku.strip():
                    existing_skus.add(sku.strip().upper())
            
            # Separate variations by status
            to_create = [v for v in variations if v.get("status") == "new"]
            to_update = [v for v in variations if v.get("status") == "modified" and v.get("id")]
            to_delete = [v for v in variations if v.get("status") == "to_delete" and v.get("id")]
            
            # Delete variations
            for var in to_delete:
                try:
                    await client._request("DELETE", f"/wp-json/wc/v3/products/{product_id}/variations/{var['id']}")
                    results["variations_deleted"] += 1
                except Exception as e:
                    results["errors"].append(f"Failed to delete variation {var['id']}: {str(e)}")
            
            # Create variations
            for var in to_create:
                try:
                    var_attrs = var.get("attributes", {})
                    
                    # Auto-add new options to attributes if needed
                    for attr_key, attr_value in var_attrs.items():
                        if not attr_value:
                            continue
                        attr_obj = attr_slug_to_obj.get(attr_key)
                        if attr_obj:
                            options = attr_obj.get("options", [])
                            # Check if option exists (case-insensitive)
                            option_exists = any(
                                normalize_text_for_matching(opt) == normalize_text_for_matching(attr_value)
                                for opt in options
                            )
                            if not option_exists:
                                options.append(attr_value)
                                attr_obj["options"] = options
                    
                    # Auto-generate SKU if empty and we have size/color
                    var_sku = var.get("sku", "").strip()
                    if not var_sku and size_key and color_key:
                        size_val = var_attrs.get(size_key, "")
                        color_val = var_attrs.get(color_key, "")
                        if size_val and color_val:
                            generated_sku = generate_variation_sku(product_id, size_val, color_val, existing_skus)
                            if generated_sku:
                                var_sku = generated_sku
                                existing_skus.add(generated_sku)
                    
                    # Build attribute payloads
                    attr_payloads = []
                    for attr_key, attr_value in var_attrs.items():
                        if not attr_value:
                            continue
                        attr_id = attr_slug_to_id.get(attr_key)
                        if attr_id:
                            attr_payloads.append({"id": attr_id, "option": attr_value})
                        else:
                            attr_name = attr_slug_to_name.get(attr_key, attr_key)
                            attr_payloads.append({"name": attr_name, "option": attr_value})
                    
                    if not attr_payloads:
                        continue
                    
                    var_payload = {
                        "sku": var_sku,
                        "attributes": attr_payloads
                    }
                    
                    if var.get("regular_price"):
                        var_payload["regular_price"] = var["regular_price"]
                    if var.get("sale_price"):
                        var_payload["sale_price"] = var["sale_price"]
                    if var.get("image_id"):
                        var_payload["image"] = {"id": var["image_id"]}
                    
                    await client._request("POST", f"/wp-json/wc/v3/products/{product_id}/variations", json_data=var_payload)
                    results["variations_created"] += 1
                except Exception as e:
                    results["errors"].append(f"Failed to create variation: {str(e)}")
            
            # Update variations
            for var in to_update:
                try:
                    var_payload = {"id": var["id"]}
                    
                    if var.get("regular_price") is not None:
                        var_payload["regular_price"] = var["regular_price"]
                    if var.get("sale_price") is not None:
                        var_payload["sale_price"] = var["sale_price"]
                    if var.get("image_id") is not None:
                        var_payload["image"] = {"id": var["image_id"]} if var["image_id"] else None
                    
                    await client._request("PUT", f"/wp-json/wc/v3/products/{product_id}/variations/{var['id']}", json_data=var_payload)
                    results["variations_updated"] += 1
                except Exception as e:
                    results["errors"].append(f"Failed to update variation {var['id']}: {str(e)}")
        
        # Delete media if needed
        if wp_client and product_data.get("images_to_delete_media_ids"):
            for media_id in product_data["images_to_delete_media_ids"]:
                try:
                    await wp_client.delete_media(media_id, force=True)
                except Exception:
                    pass  # Ignore media deletion errors
        
    except Exception as e:
        results["errors"].append(f"Failed to update product: {str(e)}")
    
    return results
