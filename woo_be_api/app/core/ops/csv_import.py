"""
CSV import operations.
"""

import re
import asyncio
import unicodedata
from typing import List, Dict, Any, Optional
from app.core.woo_client import WooClient
from app.core.wp_client import WPClient
from app.core.events import JobEventEmitter, JobStateManager


def slugify(text: str) -> str:
    """Convert text to URL-safe slug."""
    if not text:
        return ""
    norm = unicodedata.normalize('NFKD', text)
    ascii_text = norm.encode('ascii', 'ignore').decode('ascii')
    ascii_text = ascii_text.lower()
    ascii_text = re.sub(r"[^a-z0-9\s-]", "", ascii_text)
    ascii_text = re.sub(r"[\s-]+", "-", ascii_text).strip('-')
    return ascii_text or "image"


async def upload_image_to_wp(
    wp_client: WPClient,
    image_url: str,
    filename: str,
    alt_text: str = ""
) -> Optional[int]:
    """Upload image from URL to WordPress media library."""
    try:
        import httpx
        import tempfile
        import os
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(image_url, follow_redirects=True)
            if response.status_code != 200:
                return None
            
            content = response.content
            content_type = response.headers.get('Content-Type', 'image/jpeg')
            
            # Determine extension
            ext = '.jpg'
            if 'png' in content_type or image_url.lower().endswith('.png'):
                ext = '.png'
            elif 'webp' in content_type or image_url.lower().endswith('.webp'):
                ext = '.webp'
            elif 'gif' in content_type or image_url.lower().endswith('.gif'):
                ext = '.gif'
            
            # Save to temp file and upload
            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp_file:
                tmp_file.write(content)
                tmp_path = tmp_file.name
            
            try:
                # Upload using WPClient (expects file_path)
                result = await wp_client.upload_media(tmp_path)
                if result and result.get("id"):
                    media_id = result["id"]
                    # Update alt text if provided
                    if alt_text and media_id:
                        try:
                            await wp_client.client.put(
                                f"{wp_client.base}/media/{media_id}",
                                json={"alt_text": alt_text}
                            )
                        except:
                            pass  # Alt text update is optional
                    return media_id
                return None
            finally:
                # Clean up temp file
                if os.path.exists(tmp_path):
                    os.unlink(tmp_path)
    except Exception as e:
        return None


async def ensure_attribute(
    client: WooClient,
    attr_name: str,
    attr_slug: str
) -> Optional[int]:
    """Ensure attribute taxonomy exists, return attribute ID."""
    try:
        # Get all attributes
        response = await client._request("GET", "/wp-json/wc/v3/products/attributes")
        attrs = response.json()
        
        # Check if exists
        for attr in attrs:
            if attr.get("slug") == attr_slug:
                return attr.get("id")
        
        # Create new attribute
        attr_data = {
            "name": attr_name,
            "slug": attr_slug,
            "type": "select",
            "order_by": "menu_order",
            "has_archives": True
        }
        response = await client._request("POST", "/wp-json/wc/v3/products/attributes", json_data=attr_data)
        attr_result = response.json()
        return attr_result.get("id")
    except Exception:
        return None


async def ensure_attribute_term(
    client: WooClient,
    attr_id: int,
    term_name: str,
    menu_order: int = 0
) -> Optional[int]:
    """Ensure attribute term exists, return term ID."""
    try:
        # Check if term exists
        response = await client._request(
            "GET",
            f"/wp-json/wc/v3/products/attributes/{attr_id}/terms",
            params={"search": term_name}
        )
        terms = response.json()
        if terms:
            return terms[0].get("id")
        
        # Create new term
        term_data = {
            "name": term_name,
            "menu_order": menu_order
        }
        response = await client._request(
            "POST",
            f"/wp-json/wc/v3/products/attributes/{attr_id}/terms",
            json_data=term_data
        )
        term_result = response.json()
        return term_result.get("id")
    except Exception:
        return None


async def run_csv_import_job(
    client: WooClient,
    wp_client: Optional[WPClient],
    emitter: JobEventEmitter,
    state_manager: JobStateManager,
    job_id: str,
    csv_content: str,
    category_id: Optional[int],
    tag: Optional[str],
    options: Dict[str, Any]
):
    """Run CSV import job."""
    try:
        await emitter.emit_status("running", total=0)
        await emitter.emit_log("info", "Đang đọc file CSV...")
        
        # Parse CSV
        try:
            import pandas as pd
        except ImportError:
            await emitter.emit_log("error", "pandas module not installed. Please install: pip install pandas")
            await emitter.emit_status("failed", total=0)
            raise ImportError("pandas module is required for CSV import. Install with: pip install pandas")
        
        from io import StringIO
        
        # Remove BOM if present
        if csv_content.startswith('\ufeff'):
            csv_content = csv_content[1:]
        
        df = pd.read_csv(StringIO(csv_content))
        df.columns = [c.strip() for c in df.columns]
        df = df.map(lambda x: x.strip() if isinstance(x, str) else x)
        
        # Normalize image column names
        if "Image Link" in df.columns and "Image" not in df.columns:
            df.rename(columns={"Image Link": "Image"}, inplace=True)
        if "Image URL" in df.columns and "Image" not in df.columns:
            df.rename(columns={"Image URL": "Image"}, inplace=True)
        
        # Check required columns
        required_cols = ["Title", "Price"]
        for col in required_cols:
            if col not in df.columns:
                await emitter.emit_log("error", f"CSV thiếu cột bắt buộc: {col}")
                await emitter.emit_status("failed", total=0)
                return
        
        # Process price column
        df["Price"] = df["Price"].astype(str).str.replace(",", ".")
        for col in df.columns:
            if df[col].dtype != 'object':
                df[col] = df[col].astype(object)
        df = df.fillna("")
        
        # Check for empty titles
        empty_title = df["Title"].isna() | (df["Title"] == "")
        if empty_title.any():
            await emitter.emit_log("error", f"Có {empty_title.sum()} dòng có Title trống")
            await emitter.emit_status("failed", total=0)
            return
        
        # Ensure attributes exist
        await emitter.emit_log("info", "Đang chuẩn bị attributes...")
        color_attr_id = await ensure_attribute(client, "Color", "pa_color")
        size_attr_id = await ensure_attribute(client, "Size", "pa_size")
        
        # Group by Title
        grouped = df.groupby("Title")
        total_products = len(grouped)
        
        await emitter.emit_status("running", total=total_products)
        await emitter.emit_log("info", f"Tổng số sản phẩm cần xử lý: {total_products}")
        
        success = 0
        failed = 0
        skipped = 0
        current = 0
        
        for title, group in grouped:
            # Check for pause/stop
            state = await state_manager.get_job_state(job_id)
            if state and state.get("status") == "cancelled":
                await emitter.emit_log("warning", "Job đã bị hủy")
                break
            
            current += 1
            await emitter.emit_progress(done=current, total=total_products, success=success, failed=failed, skipped=skipped)
            
            # Check if has price rows
            has_price_rows = group["Price"].str.strip() != ""
            if not has_price_rows.any():
                await emitter.emit_log("warning", f"Bỏ qua '{title}' - không có Price")
                skipped += 1
                continue
            
            # Get description
            description = group["Description"].iloc[0] if "Description" in group.columns else ""
            
            # Collect all images
            all_imgs = []
            if "Image" in group.columns:
                for img_string in group["Image"].dropna().unique():
                    all_imgs.extend([p.strip() for p in str(img_string).split("|") if p.strip()])
            
            # Collect attributes from price rows
            price_rows = group[has_price_rows].sort_index()
            color_values = []
            size_values = []
            
            for idx in sorted(price_rows.index):
                row = price_rows.loc[idx]
                color = str(row.get("Color", "")).strip()
                size = str(row.get("Size", "")).strip()
                if color and color not in color_values:
                    color_values.append(color)
                if size and size not in size_values:
                    size_values.append(size)
            
            # Create attribute terms
            for i, color in enumerate(color_values):
                await ensure_attribute_term(color_attr_id, color, i)
            for i, size in enumerate(size_values):
                await ensure_attribute_term(size_attr_id, size, i)
            
            # Build product data
            product_data = {
                "name": title,
                "type": "variable",
                "description": description,
                "categories": [{"id": category_id}] if category_id else [],
                "tags": [{"name": tag}] if tag else [],
                "attributes": []
            }
            
            if color_values:
                product_data["attributes"].append({
                    "id": color_attr_id,
                    "name": "pa_color",
                    "position": 0,
                    "visible": True,
                    "variation": True,
                    "options": color_values
                })
            
            if size_values:
                product_data["attributes"].append({
                    "id": size_attr_id,
                    "name": "pa_size",
                    "position": 1,
                    "visible": True,
                    "variation": True,
                    "options": size_values
                })
            
            # Upload images
            if all_imgs and wp_client:
                await emitter.emit_log("info", f"Đang upload {len(all_imgs)} ảnh cho '{title}'...")
                image_ids = []
                base = slugify(title)
                
                for idx, link in enumerate(all_imgs, start=1):
                    filename = f"{base}-{idx}"
                    alt_text = f"{title} - Image {idx}"
                    media_id = await upload_image_to_wp(wp_client, link, filename, alt_text)
                    if media_id:
                        image_ids.append({"id": media_id})
                
                if image_ids:
                    product_data["images"] = image_ids
                    await emitter.emit_log("success", f"Đã upload {len(image_ids)} ảnh")
                else:
                    # Fallback: use direct links
                    product_data["images"] = [{"src": link} for link in all_imgs]
            
            # Create product
            await emitter.emit_log("info", f"Đang tạo sản phẩm: {title}")
            try:
                product = await client._request("POST", "/wp-json/wc/v3/products", json_data=product_data)
                product_result = product.json()
                product_id = product_result.get("id")
                
                if not product_id:
                    await emitter.emit_log("error", f"Không tạo được sản phẩm: {title}")
                    failed += 1
                    continue
                
                await emitter.emit_log("success", f"Đã tạo sản phẩm ID: {product_id}")
                success += 1
                
                # Create variations
                var_image_counter = 1
                created_variations = set()
                
                for idx in sorted(price_rows.index):
                    row = price_rows.loc[idx]
                    color = str(row.get("Color", "")).strip()
                    size = str(row.get("Size", "")).strip()
                    price = str(row.get("Price", "")).strip()
                    
                    # Validate price
                    if not price:
                        continue
                    try:
                        price_float = float(price.replace(",", "."))
                        if price_float <= 0:
                            continue
                    except ValueError:
                        continue
                    
                    # Check duplicate
                    variation_key = f"{color}|{size}"
                    if variation_key in created_variations:
                        continue
                    created_variations.add(variation_key)
                    
                    # Build attributes
                    attr = []
                    if color:
                        attr.append({"name": "pa_color", "option": color})
                    if size:
                        attr.append({"name": "pa_size", "option": size})
                    
                    if not attr:
                        continue
                    
                    # Build variation payload
                    variation_payload = {
                        "sku": f"{product_id}-{var_image_counter}",
                        "regular_price": price,
                        "attributes": attr
                    }
                    
                    # Add variation image if available
                    img_val = str(row.get("Image", "")).strip()
                    if img_val and wp_client:
                        first_img = img_val.split("|")[0].strip()
                        if first_img:
                            base = slugify(title)
                            suffix = f"-var-{var_image_counter}"
                            var_image_counter += 1
                            filename = f"{base}{suffix}"
                            variation_name = f"{color} - {size}" if color and size else (color or size or "Default")
                            alt_text = f"{title} - {variation_name}"
                            media_id = await upload_image_to_wp(wp_client, first_img, filename, alt_text)
                            if media_id:
                                variation_payload["image"] = {"id": media_id}
                            else:
                                variation_payload["image"] = {"src": first_img}
                    
                    # Create variation
                    try:
                        await client._request(
                            "POST",
                            f"/wp-json/wc/v3/products/{product_id}/variations",
                            json_data=variation_payload
                        )
                        await emitter.emit_log("info", f"  ➡️ Tạo biến thể: {color} - {size}")
                    except Exception as e:
                        await emitter.emit_log("error", f"  ❌ Lỗi biến thể: {str(e)}")
                
            except Exception as e:
                await emitter.emit_log("error", f"Lỗi tạo sản phẩm '{title}': {str(e)}")
                failed += 1
        
        # Final status
        await emitter.emit_log("info", f"Hoàn thành: {success} thành công, {skipped} bỏ qua, {failed} thất bại")
        await emitter.emit_status("done", total=total_products)
        
    except Exception as e:
        await emitter.emit_log("error", f"Lỗi: {str(e)}")
        await emitter.emit_status("failed", total=0)
        raise

