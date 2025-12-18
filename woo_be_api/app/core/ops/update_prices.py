"""
Update prices job operation.
Rewritten to match desktop app logic.
"""

import asyncio
from typing import List, Dict, Any, Optional, Literal
from app.core.woo_client import WooClient
from app.core.events import JobEventEmitter, JobStateManager
from app.core.price_calculator import calculate_product_prices
from app.core.utils import chunked


async def run_update_prices_job(
    client: WooClient,
    emitter: JobEventEmitter,
    state_manager: JobStateManager,
    job_id: str,
    category_id: Optional[int],  # None = all categories
    adjustment_type: Literal["increase", "decrease"],
    adjustment_mode: Literal["amount", "percent"],
    adjustment_value: float,
    options: Dict[str, Any]
):
    """
    Run update prices job matching desktop app logic.
    
    Args:
        client: WooClient instance
        emitter: JobEventEmitter for progress updates
        state_manager: JobStateManager for cancellation checks
        job_id: Job ID
        category_id: Category ID (None = all categories)
        adjustment_type: "increase" or "decrease"
        adjustment_mode: "amount" or "percent"
        adjustment_value: Adjustment value
        options: Job options (batch_size, max_retries, delay_between_batches)
    """
    batch_size = options.get("batch_size", 30)
    max_retries = options.get("max_retries", 4)
    delay_between_batches = options.get("delay_between_batches", 0.2)
    
    # Resolve products
    if category_id is None:
        # All categories
        await emitter.emit_log("INFO", "📥 Đang tải sản phẩm từ tất cả categories...")
        # Get all categories first
        categories = await client.get_all_categories()
        all_products = []
        
        for cat in categories:
            # Check cancellation
            if await state_manager.is_cancelled(job_id):
                await emitter.emit_status("cancelled")
                return
            
            cat_id = cat.get("id")
            cat_name = cat.get("name", f"Category {cat_id}")
            await emitter.emit_log("INFO", f"  📥 Category {cat_name} (ID={cat_id})...")
            
            products = await client.fetch_products_with_details_by_category(cat_id)
            all_products.extend(products)
            await emitter.emit_log("INFO", f"  ✓ {len(products)} sản phẩm")
        
        products = all_products
    else:
        # Single category
        await emitter.emit_log("INFO", f"📥 Đang tải sản phẩm từ category ID {category_id}...")
        products = await client.fetch_products_with_details_by_category(category_id)
    
    if not products:
        await emitter.emit_log("WARN", "Không tìm thấy sản phẩm nào")
        await emitter.emit_status("done")
        return
    
    total = len(products)
    await emitter.emit_log("INFO", f"✅ Đã tải {total} sản phẩm")
    await emitter.emit_log("INFO", "🔄 Đang tính toán giá mới...")
    await emitter.emit_status("running", total)
    
    stats = {"success": 0, "failed": 0, "skipped": 0, "total": total}
    
    # Collect all updates
    product_updates = []  # For simple products
    variation_updates_by_product = {}  # {product_id: [updates]} for variable products
    product_info = {}  # Store product info for logging
    
    # Step 1: Calculate new prices (async tasks)
    async def process_product(product: Dict) -> tuple[Optional[Dict], Optional[Dict], Optional[str]]:
        """Process a product: calculate new prices"""
        try:
            product_id = product.get("id")
            product_name = product.get("name", f"Product #{product_id}")
            product_type = product.get("type", "simple")
            
            product_info[product_id] = {"name": product_name, "type": product_type}
            
            # Handle variable products
            if product_type == "variable":
                # Get and calculate prices for all variations
                variations = await client.get_product_variations(product_id)
                
                if variations:
                    variation_updates = []
                    for variation in variations:
                        var_id = variation.get("id")
                        var_regular = variation.get("regular_price")
                        var_sale = variation.get("sale_price")
                        
                        new_regular, new_sale = calculate_product_prices(
                            var_regular, var_sale,
                            adjustment_type, adjustment_mode, adjustment_value
                        )
                        
                        if new_regular is not None or new_sale is not None:
                            update_data = {"id": var_id}
                            if new_regular is not None:
                                update_data["regular_price"] = str(new_regular)
                            if new_sale is not None:
                                update_data["sale_price"] = str(new_sale)
                            variation_updates.append(update_data)
                    
                    if variation_updates:
                        return None, {product_id: variation_updates}, None
                    else:
                        return None, None, "skipped"
                else:
                    return None, None, "skipped"
            else:
                # Handle simple products
                regular_price = product.get("regular_price")
                sale_price = product.get("sale_price")
                
                new_regular, new_sale = calculate_product_prices(
                    regular_price, sale_price,
                    adjustment_type, adjustment_mode, adjustment_value
                )
                
                if new_regular is not None or new_sale is not None:
                    update_data = {"id": product_id}
                    if new_regular is not None:
                        update_data["regular_price"] = str(new_regular)
                    if new_sale is not None:
                        update_data["sale_price"] = str(new_sale)
                    return update_data, None, None
                else:
                    return None, None, "skipped"
        
        except Exception as e:
            return None, None, str(e)
    
    # Process all products concurrently (with limit)
    semaphore = asyncio.Semaphore(5)  # Max 5 concurrent
    
    async def process_with_semaphore(product: Dict):
        async with semaphore:
            return await process_product(product)
    
    tasks = [process_with_semaphore(product) for product in products]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Collect results
    for i, result in enumerate(results):
        product = products[i]
        product_id = product.get("id")
        
        if isinstance(result, Exception):
            stats["failed"] += 1
            await emitter.emit_log("ERROR", f"Lỗi khi tính toán giá cho sản phẩm {product_id}: {str(result)}", product_id)
            continue
        
        product_update, variation_update, error = result
        
        if error:
            if error == "skipped":
                stats["skipped"] += 1
            else:
                stats["failed"] += 1
                product_name = product_info.get(product_id, {}).get("name", f"Product #{product_id}")
                await emitter.emit_log("ERROR", f"Lỗi khi tính toán giá cho sản phẩm {product_name}: {error}", product_id)
        else:
            if product_update:
                product_updates.append(product_update)
            if variation_update:
                variation_updates_by_product.update(variation_update)
    
    await emitter.emit_log("INFO", f"✅ Đã tính toán xong")
    
    # Step 2: Batch update simple products
    all_failed_items = []
    
    if product_updates:
        total_products = len(product_updates)
        total_batches = (total_products + batch_size - 1) // batch_size
        
        await emitter.emit_log("INFO", f"📦 Đang batch update {total_products} sản phẩm simple ({total_batches} batches)...")
        
        batches = list(chunked(product_updates, batch_size))
        
        for batch_num, batch in enumerate(batches, 1):
            # Check cancellation
            if await state_manager.is_cancelled(job_id):
                await emitter.emit_log("INFO", "Job cancelled by user")
                await emitter.emit_status("cancelled")
                return
            
            try:
                result = await client.batch_update_products(batch)
                updated_items = result.get("update", [])
                stats["success"] += len(updated_items)
                
                # Log updated products
                for item in updated_items:
                    pid = item.get("id")
                    pname = product_info.get(pid, {}).get("name", f"Sản phẩm #{pid}")
                    await emitter.emit_log("SUCCESS", f"Đã cập nhật sản phẩm {pname}", pid)
                
                # Check for failed items (items not in result["update"])
                updated_ids = {item.get("id") for item in updated_items}
                failed_in_batch = [item for item in batch if item.get("id") not in updated_ids]
                if failed_in_batch:
                    all_failed_items.extend([{"type": "product", "item": item} for item in failed_in_batch])
                    stats["failed"] += len(failed_in_batch)
                
                await emitter.emit_log("INFO", f"✓ Batch {batch_num}/{total_batches} hoàn thành")
                await emitter.emit_progress(stats["success"] + stats["failed"] + stats["skipped"], total, stats["success"], stats["failed"])
                
            except Exception as e:
                await emitter.emit_log("ERROR", f"Lỗi khi update batch {batch_num}: {str(e)}")
                all_failed_items.extend([{"type": "product", "item": item} for item in batch])
                stats["failed"] += len(batch)
            
            # Delay between batches
            if batch_num < total_batches:
                await asyncio.sleep(delay_between_batches)
    
    # Step 3: Batch update variations
    if variation_updates_by_product:
        total_products = len(variation_updates_by_product)
        await emitter.emit_log("INFO", f"📦 Đang batch update variations cho {total_products} variable products...")
        
        completed_count = 0
        
        for product_id, variation_updates in variation_updates_by_product.items():
            # Check cancellation
            if await state_manager.is_cancelled(job_id):
                await emitter.emit_log("INFO", "Job cancelled by user")
                await emitter.emit_status("cancelled")
                return
            
            product_name = product_info[product_id]["name"]
            
            try:
                result, failed_items = await client.batch_update_variations(
                    product_id, variation_updates, delay_between_batches=delay_between_batches
                )
                
                updated_count = len(result.get("update", []))
                
                if failed_items:
                    all_failed_items.extend([{
                        "type": "variation",
                        "product_id": product_id,
                        "item": item
                    } for item in failed_items])
                    stats["failed"] += 1
                
                if updated_count > 0:
                    stats["success"] += 1
                    await emitter.emit_log("SUCCESS", f"Đã cập nhật sản phẩm {product_name} ({updated_count} variations)", product_id)
                else:
                    stats["failed"] += 1
                    await emitter.emit_log("ERROR", f"Không có variation nào được cập nhật cho {product_name}", product_id)
                
                completed_count += 1
                await emitter.emit_progress(stats["success"] + stats["failed"] + stats["skipped"], total, stats["success"], stats["failed"])
                
            except Exception as e:
                completed_count += 1
                stats["failed"] += 1
                await emitter.emit_log("ERROR", f"Lỗi khi update variations cho {product_name}: {str(e)}", product_id)
                all_failed_items.extend([{
                    "type": "variation",
                    "product_id": product_id,
                    "item": var_update
                } for var_update in variation_updates])
    
    # Save failed items to Redis (if any)
    if all_failed_items:
        # Store in job state for later retrieval
        await state_manager.set_job_data(job_id, "failed_items", all_failed_items)
        await emitter.emit_log("WARN", f"💾 Có {len(all_failed_items)} failed items, đã lưu vào job state")
    
    # Final status
    if await state_manager.is_cancelled(job_id):
        await emitter.emit_status("cancelled")
    else:
        await emitter.emit_log("INFO", f"Job completed: {stats['success']} updated, {stats['failed']} failed, {stats['skipped']} skipped")
        await emitter.emit_status("done")
        await emitter.emit_progress(stats["success"] + stats["failed"] + stats["skipped"], total, stats["success"], stats["failed"])
