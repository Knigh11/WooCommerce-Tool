"""
Bulk product update operations.
"""

import re
import asyncio
from typing import List, Dict, Any, Optional
from app.core.woo_client import WooClient
from app.core.events import JobEventEmitter, JobStateManager


def strip_html_tags(text: str) -> str:
    """Strip HTML tags from text."""
    if not text:
        return ""
    return re.sub(r'<[^>]+>', '', text).strip()


def render_template(template: str, product: Dict[str, Any]) -> str:
    """
    Render template with product data placeholders.
    
    Supported placeholders:
    - {title} -> product.name
    - {sku} -> product.sku or ""
    - {short} -> plain-text version of product.short_description
    - {categories} -> comma-separated list of category names
    """
    if not template:
        return ""
    
    title = product.get("name", "") or ""
    sku = product.get("sku", "") or ""
    short = strip_html_tags(product.get("short_description", "") or "")
    categories = ", ".join(product.get("categories", [])) if product.get("categories") else ""
    
    result = template
    result = result.replace("{title}", title)
    result = result.replace("{sku}", sku)
    result = result.replace("{short}", short)
    result = result.replace("{categories}", categories)
    
    return result


def remove_marker_block(description: str) -> str:
    """Remove existing marker block from description."""
    if not description:
        return ""
    pattern = r'<!--\s*TOOL_UPDATE_START\s-->.*?<!--\s*TOOL_UPDATE_END\s-->'
    result = re.sub(pattern, '', description, flags=re.DOTALL)
    return result.strip()


def build_update_payload(product: Dict[str, Any], options: Dict[str, Any]) -> Dict[str, Any]:
    """Build update payload for a single product."""
    data = {}
    
    # Title update
    if options.get("update_title"):
        old_name = product.get("name", "") or ""
        new_name = old_name
        
        # Handle None or empty string - get prefix/suffix
        prefix_raw = options.get("prefix")
        suffix_raw = options.get("suffix")
        prefix = prefix_raw.strip() if prefix_raw and isinstance(prefix_raw, str) else ""
        suffix = suffix_raw.strip() if suffix_raw and isinstance(suffix_raw, str) else ""
        avoid_duplicate = options.get("avoid_duplicate_title", True)
        
        # Build new name with prefix and suffix
        # Add space automatically if prefix/suffix don't already have it
        if prefix:
            prefix_with_space = prefix + " "
            new_name = prefix_with_space + new_name
        
        if suffix:
            suffix_with_space = " " + suffix
            new_name = new_name + suffix_with_space
        
        # Check avoid_duplicate_title
        if avoid_duplicate:
            # Normalize prefix/suffix for comparison (with space, stripped)
            prefix_for_check = prefix + " " if prefix else ""
            suffix_for_check = " " + suffix if suffix else ""
            
            if prefix and old_name.startswith(prefix_for_check):
                # Already has prefix, don't add again
                new_name = old_name
                if suffix and not old_name.endswith(suffix_for_check):
                    suffix_with_space = " " + suffix
                    new_name = new_name + suffix_with_space
            elif suffix and old_name.endswith(suffix_for_check):
                # Already has suffix, don't add again
                new_name = old_name
                if prefix and not old_name.startswith(prefix_for_check):
                    prefix_with_space = prefix + " "
                    new_name = prefix_with_space + new_name
        
        if new_name != old_name:
            data["name"] = new_name
    
    # Short description update
    if options.get("update_short_description"):
        short_template = options.get("short_template")
        if short_template and isinstance(short_template, str) and short_template.strip():
            new_short = render_template(short_template, product)
            if new_short != product.get("short_description", ""):
                data["short_description"] = new_short
    
    # Main description update
    if options.get("update_description"):
        description_template = options.get("description_template")
        if description_template and isinstance(description_template, str) and description_template.strip():
            block = render_template(description_template, product)
            
            if not block:
                # Empty template, skip
                pass
            else:
                original_desc = product.get("description", "") or ""
                old_desc = original_desc
                
                # Remove existing marker block if enabled
                if options.get("use_marker_for_description"):
                    old_desc = remove_marker_block(old_desc)
                
                # Wrap block in markers
                marked_block = f"<!-- TOOL_UPDATE_START -->\n{block}\n<!-- TOOL_UPDATE_END -->"
                
                mode = options.get("description_mode", "append")
                if mode == "replace":
                    new_desc = marked_block
                elif mode == "append":
                    if old_desc:
                        new_desc = old_desc + "\n\n" + marked_block
                    else:
                        new_desc = marked_block
                elif mode == "prepend":
                    if old_desc:
                        new_desc = marked_block + "\n\n" + old_desc
                    else:
                        new_desc = marked_block
                
                # Compare with original description to avoid unnecessary updates
                if new_desc != original_desc:
                    data["description"] = new_desc
    
    return data


async def fetch_products_for_bulk_update(
    client: WooClient,
    mode: str,
    urls: Optional[List[str]] = None,
    category_ids: Optional[List[int]] = None,
    emitter: Optional[JobEventEmitter] = None
) -> List[Dict[str, Any]]:
    """Fetch products based on mode (urls or categories)."""
    all_products_dict = {}
    
    if mode == "urls" and urls:
        if emitter:
            await emitter.emit_log("info", f"Đang tải {len(urls)} sản phẩm từ URLs...")
        
        for url in urls:
            url = url.strip()
            if not url:
                continue
            
            try:
                # Extract slug from URL
                from urllib.parse import urlparse
                parsed = urlparse(url)
                path = parsed.path.rstrip("/")
                slug_match = re.search(r"/product/([^/?#]+)/?$", path)
                slug = slug_match.group(1) if slug_match else None
                
                if slug:
                    product = await client.get_product_by_slug(slug)
                    if product and product.get("id"):
                        product_id = product["id"]
                        # Extract category names
                        categories = []
                        for cat in product.get("categories", []):
                            if isinstance(cat, dict):
                                categories.append(cat.get("name", ""))
                        
                        # Build product dict with required fields
                        product_data = {
                            "id": product_id,
                            "name": product.get("name", ""),
                            "slug": product.get("slug", ""),
                            "short_description": product.get("short_description", "") or "",
                            "description": product.get("description", "") or "",
                            "sku": product.get("sku", "") or "",
                            "categories": categories
                        }
                        
                        if product_id not in all_products_dict:
                            all_products_dict[product_id] = product_data
            except Exception as e:
                if emitter:
                    await emitter.emit_log("warning", f"Lỗi khi tải URL {url}: {str(e)}")
    
    elif mode == "categories" and category_ids:
        if emitter:
            await emitter.emit_log("info", f"Đang tải sản phẩm từ {len(category_ids)} categories...")
        
        for cat_id in category_ids:
            try:
                page = 1
                per_page = 100
                
                while True:
                    params = {
                        "category": cat_id,
                        "per_page": per_page,
                        "page": page,
                        "status": "any"
                    }
                    
                    response = await client._request("GET", "/wp-json/wc/v3/products", params=params)
                    products = response.json()
                    
                    if not products:
                        break
                    
                    for p in products:
                        product_id = p.get("id")
                        if not product_id:
                            continue
                        
                        # Extract category names
                        categories = []
                        for cat in p.get("categories", []):
                            if isinstance(cat, dict):
                                categories.append(cat.get("name", ""))
                        
                        # Build product dict with required fields
                        product_data = {
                            "id": product_id,
                            "name": p.get("name", ""),
                            "slug": p.get("slug", ""),
                            "short_description": p.get("short_description", "") or "",
                            "description": p.get("description", "") or "",
                            "sku": p.get("sku", "") or "",
                            "categories": categories
                        }
                        
                        if product_id not in all_products_dict:
                            all_products_dict[product_id] = product_data
                    
                    if len(products) < per_page:
                        break
                    
                    page += 1
            except Exception as e:
                if emitter:
                    await emitter.emit_log("warning", f"Lỗi khi tải category {cat_id}: {str(e)}")
    
    result = list(all_products_dict.values())
    if emitter:
        await emitter.emit_log("info", f"Đã tải {len(result)} sản phẩm (sau khi loại trùng)")
    
    return result


async def run_bulk_update_job(
    client: WooClient,
    emitter: JobEventEmitter,
    state_manager: JobStateManager,
    job_id: str,
    mode: str,
    urls: Optional[List[str]],
    category_ids: Optional[List[int]],
    options: Dict[str, Any]
):
    """Run bulk update job."""
    try:
        await emitter.emit_status("running", total=0)
        
        # Fetch products
        await emitter.emit_log("info", "Đang tải danh sách sản phẩm...")
        products = await fetch_products_for_bulk_update(
            client, mode, urls, category_ids, emitter
        )
        
        if not products:
            await emitter.emit_log("warning", "Không tìm thấy sản phẩm nào")
            await emitter.emit_status("done", total=0)
            return
        
        total = len(products)
        await emitter.emit_status("running", total=total)
        
        # Build update options
        update_options = {
            "update_title": options.get("update_title", False),
            "prefix": options.get("prefix"),
            "suffix": options.get("suffix"),
            "avoid_duplicate_title": options.get("avoid_duplicate_title", True),
            "update_short_description": options.get("update_short_description", False),
            "short_template": options.get("short_template"),
            "update_description": options.get("update_description", False),
            "description_mode": options.get("description_mode", "append"),
            "description_template": options.get("description_template"),
            "use_marker_for_description": options.get("use_marker_for_description", True),
        }
        
        job_options = options.get("options", {})
        dry_run = job_options.get("dry_run", False)
        batch_size = job_options.get("batch_size", 10)
        delay_between_batches = job_options.get("delay_between_batches", 0.5)
        
        await emitter.emit_log("info", f"Bắt đầu cập nhật {total} sản phẩm...")
        await emitter.emit_log("info", f"Chế độ: {'DRY-RUN' if dry_run else 'THỰC THI'}")
        
        # Process in batches
        updated = 0
        skipped = 0
        failed = 0
        
        for batch_start in range(0, total, batch_size):
            batch_end = min(batch_start + batch_size, total)
            batch = products[batch_start:batch_end]
            batch_idx = (batch_start // batch_size) + 1
            total_batches = (total + batch_size - 1) // batch_size
            
            # Check for pause/stop
            state = await state_manager.get_job_state(job_id)
            if state and state.get("status") == "cancelled":
                await emitter.emit_log("warning", "Job đã bị hủy")
                break
            
            # Check pause flag
            pause_key = f"job:{job_id}:pause"
            # This would need Redis check - simplified for now
            
            await emitter.emit_log("info", f"Batch {batch_idx}/{total_batches} ({len(batch)} sản phẩm)")
            
            # Build batch payloads
            batch_payloads = []
            for product in batch:
                payload = build_update_payload(product, update_options)
                if payload:
                    payload["id"] = product["id"]
                    batch_payloads.append(payload)
                else:
                    skipped += 1
            
            if not batch_payloads:
                await emitter.emit_log("info", f"Batch {batch_idx}: Không có sản phẩm nào cần cập nhật")
                continue
            
            if dry_run:
                await emitter.emit_log("info", f"[DRY-RUN] Sẽ cập nhật {len(batch_payloads)} sản phẩm")
                updated += len(batch_payloads)
            else:
                # Real update
                try:
                    # batch_update_products expects List[Dict]
                    result = await client.batch_update_products(batch_payloads)
                    updated += len(batch_payloads)
                    await emitter.emit_log("success", f"Batch {batch_idx}: Đã cập nhật {len(batch_payloads)} sản phẩm")
                except Exception as e:
                    failed += len(batch_payloads)
                    await emitter.emit_log("error", f"Batch {batch_idx}: Lỗi - {str(e)}")
            
            # Update progress
            done = min(batch_end, total)
            await emitter.emit_progress(done=done, total=total, success=updated, failed=failed, skipped=skipped)
            
            # Delay between batches
            if batch_end < total and delay_between_batches > 0:
                await asyncio.sleep(delay_between_batches)
        
        # Final status
        await emitter.emit_log("info", f"Hoàn thành: {updated} cập nhật, {skipped} bỏ qua, {failed} thất bại")
        await emitter.emit_status("done", total=total)
        
    except Exception as e:
        await emitter.emit_log("error", f"Lỗi: {str(e)}")
        await emitter.emit_status("failed", total=0)
        raise

