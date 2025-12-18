"""
Bulk update product fields job operation.
"""

import asyncio
from typing import List, Dict, Any
from app.core.woo_client import WooClient
from app.core.events import JobEventEmitter, JobStateManager


async def run_bulk_update_fields_job(
    client: WooClient,
    emitter: JobEventEmitter,
    state_manager: JobStateManager,
    job_id: str,
    scope: Dict[str, Any],
    patch: Dict[str, Any],
    options: Dict[str, Any]
):
    """
    Run bulk update fields job.
    
    Args:
        client: WooClient instance
        emitter: JobEventEmitter for progress updates
        state_manager: JobStateManager for cancellation checks
        job_id: Job ID
        scope: Scope dict (product_ids, category_ids, or search)
        patch: Fields to update (title_prefix, title_suffix, short_description, description)
        options: Job options (batch_size, rate_limit_rps, max_retries)
    """
    batch_size = options.get("batch_size", 20)
    
    # Resolve product IDs from scope
    product_ids = await _resolve_scope(client, emitter, scope)
    
    if not product_ids:
        await emitter.emit_log("WARN", "No products found in scope")
        await emitter.emit_status("done")
        return
    
    total = len(product_ids)
    done = 0
    success = 0
    failed = 0
    
    await emitter.emit_status("running", total)
    await emitter.emit_log("INFO", f"Starting bulk update: {total} products")
    
    # Process in batches
    for i in range(0, total, batch_size):
        batch_ids = product_ids[i:i + batch_size]
        batch_num = (i // batch_size) + 1
        
        # Check cancellation
        if await state_manager.is_cancelled(job_id):
            await emitter.emit_log("INFO", "Job cancelled by user")
            await emitter.emit_status("cancelled")
            return
        
        await emitter.emit_log("INFO", f"Processing batch {batch_num} ({len(batch_ids)} products)")
        
        # Fetch and update products
        updates = []
        for product_id in batch_ids:
            try:
                product = await client.get_product(product_id)
                
                update_data = {}
                
                # Apply title prefix/suffix
                if "title_prefix" in patch or "title_suffix" in patch:
                    current_name = product.get("name", "")
                    prefix = patch.get("title_prefix", "")
                    suffix = patch.get("title_suffix", "")
                    new_name = f"{prefix}{current_name}{suffix}".strip()
                    if new_name:
                        update_data["name"] = new_name
                
                # Apply short_description
                if "short_description" in patch:
                    update_data["short_description"] = patch["short_description"]
                
                # Apply description
                if "description" in patch:
                    update_data["description"] = patch["description"]
                
                if update_data:
                    updates.append({
                        "id": product_id,
                        **update_data
                    })
                
            except Exception as e:
                await emitter.emit_log("ERROR", f"Error processing product {product_id}: {str(e)}", product_id)
                failed += 1
                done += 1
                continue
        
        # Batch update
        if updates:
            try:
                await client.batch_update_products(updates)
                success += len(updates)
                await emitter.emit_log("INFO", f"Updated {len(updates)} products in batch {batch_num}")
            except Exception as e:
                await emitter.emit_log("ERROR", f"Error updating batch {batch_num}: {str(e)}")
                failed += len(updates)
            
            done += len(updates)
            await emitter.emit_progress(done, total, success, failed)
        
        # Delay between batches
        if i + batch_size < total:
            await asyncio.sleep(0.5)
    
    # Final status
    if await state_manager.is_cancelled(job_id):
        await emitter.emit_status("cancelled")
    else:
        await emitter.emit_log("INFO", f"Job completed: {success} updated, {failed} failed")
        await emitter.emit_status("done")
        await emitter.emit_progress(done, total, success, failed)


async def _resolve_scope(client: WooClient, emitter: JobEventEmitter, scope: Dict[str, Any]) -> List[int]:
    """Resolve scope to product IDs."""
    if "product_ids" in scope:
        return scope["product_ids"]
    
    if "category_ids" in scope:
        # Fetch products by category
        category_ids = scope["category_ids"]
        product_ids = []
        for cat_id in category_ids:
            await emitter.emit_log("INFO", f"Fetching products from category {cat_id}")
            # Note: Would need proper category filtering implementation
            pass
        return product_ids
    
    if "search" in scope:
        search_term = scope["search"]
        await emitter.emit_log("INFO", f"Searching products: {search_term}")
        result = await client.get_products(search=search_term, per_page=100)
        return [p["id"] for p in result.get("items", [])]
    
    return []

