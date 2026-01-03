"""
Feed generation service - orchestrates the entire feed generation process.
"""

import os
import zipfile
from pathlib import Path
from typing import List, Optional, Callable, Dict, Any, Literal
from datetime import datetime

from app.core.woo_client import WooClient
from app.core.events import JobEventEmitter
from .models import FeedConfig, FeedItem
from .fetcher import fetch_woocommerce_products
from .xml_writer import write_feed_xml
from .adapters import feed_items_to_legacy_dict
from .sheets_writer import export_to_sheets


async def generate_feed(
    client: WooClient,
    config: FeedConfig,
    channel: Literal["gmc", "bing", "both"],
    output_dir: Path,
    emitter: JobEventEmitter,
    cancel_check: Optional[Callable[[], bool]] = None,
    export_options: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Generate feed XML files.
    
    Args:
        client: WooClient instance
        config: FeedConfig with all settings
        channel: "gmc", "bing", or "both"
        output_dir: Directory to save files (should be /data/feeds/{store_id}/{job_id}/)
        emitter: JobEventEmitter for progress/logging
        cancel_check: Optional function to check if cancelled
    
    Returns:
        Dict with 'success', 'outputs', 'errors', 'items_count'
    """
    result = {
        'success': False,
        'outputs': {},
        'errors': [],
        'items_count': 0
    }
    
    async def log(msg: str):
        """Log via emitter."""
        await emitter.emit_log("INFO", msg)
    
    try:
        await emitter.emit_status("running")
        await log("=" * 60)
        await log("🚀 Starting Feed Generation")
        await log("=" * 60)
        
        # Step 1: Fetch products
        await log("📦 Fetching products from WooCommerce...")
        await emitter.emit_progress(0, 100, current={"step": "fetching"})
        
        # Create sync log wrapper for fetcher
        def sync_log(msg: str):
            """Sync log wrapper that schedules async log."""
            import asyncio
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    asyncio.create_task(emitter.emit_log("INFO", msg))
                else:
                    asyncio.run(emitter.emit_log("INFO", msg))
            except:
                pass  # Fallback: ignore if can't log
        
        feed_items = await fetch_woocommerce_products(
            client,
            config,
            log_callback=sync_log,
            cancel_check=cancel_check
        )
        
        if cancel_check and cancel_check():
            result['errors'].append("Cancelled after fetching products")
            await emitter.emit_status("cancelled")
            return result
        
        if not feed_items:
            result['errors'].append("No products found to generate feed")
            await emitter.emit_status("failed")
            return result
        
        result['items_count'] = len(feed_items)
        await log(f"✅ Fetched {len(feed_items)} items from WooCommerce")
        
        # Ensure output directory exists
        output_dir.mkdir(parents=True, exist_ok=True)
        
        xml_files = []
        store_name_safe = config.store_name.replace(" ", "_").replace("/", "_")[:50]
        
        # Step 2: Generate XML if enabled
        should_generate_xml = export_options is None or export_options.get('xml', True)  # Default to True for backward compatibility
        if should_generate_xml:
            await emitter.emit_progress(50, 100, current={"step": "generating_xml"})
            await log("📄 Generating XML feed...")
            
            # Determine channels to generate
            if channel == "both":
                channels = ["gmc", "bing"]
            else:
                channels = [channel]
            
            # Generate XML for each channel
            for ch in channels:
                if cancel_check and cancel_check():
                    result['errors'].append("Cancelled during XML generation")
                    await emitter.emit_status("cancelled")
                    return result
                
                await log(f"📄 Generating {ch.upper()} XML...")
                xml_string = write_feed_xml(feed_items, config, channel=ch, log_callback=sync_log)
                
                if not xml_string:
                    result['errors'].append(f"Failed to generate XML for channel {ch}")
                    continue
                
                # Generate filename
                if ch == "gmc":
                    filename = f"gmc_{store_name_safe}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xml"
                else:  # bing
                    filename = f"bing_{store_name_safe}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xml"
                
                xml_file = output_dir / filename
                
                with open(xml_file, 'w', encoding='utf-8') as f:
                    f.write(xml_string)
                
                xml_files.append({
                    'channel': ch,
                    'path': str(xml_file.absolute()),
                    'filename': xml_file.name
                })
                
                await log(f"✅ Created {ch.upper()} XML file: {xml_file.name}")
            
            if not xml_files:
                result['errors'].append("Failed to generate any XML files")
                await emitter.emit_status("failed")
                return result
            
            # Step 3: Create ZIP if multiple files or channel=both
            if len(xml_files) > 1 or channel == "both":
                zip_filename = f"feeds_{store_name_safe}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
                zip_path = output_dir / zip_filename
                
                with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                    for xml_file_info in xml_files:
                        zipf.write(xml_file_info['path'], xml_file_info['filename'])
                
                result['outputs']['zip_path'] = str(zip_path.absolute())
                result['outputs']['zip_filename'] = zip_path.name
                await log(f"✅ Created ZIP file: {zip_path.name}")
            else:
                # Single XML file
                result['outputs']['xml_path'] = xml_files[0]['path']
                result['outputs']['xml_filename'] = xml_files[0]['filename']
            
            result['outputs']['xml_files'] = xml_files
        else:
            await log("ℹ️ XML export is disabled, skipping XML generation")
        
        # Step 4: Export to Google Sheets if enabled
        # Debug: Log export_options to help diagnose issues
        if export_options:
            await log(f"🔍 Debug: export_options = {export_options}")
            await log(f"🔍 Debug: sheets flag = {export_options.get('sheets', False)}")
            await log(f"🔍 Debug: sheets_config = {export_options.get('sheets_config')}")
        
        if export_options and export_options.get('sheets', False):
            sheets_config = export_options.get('sheets_config')
            if sheets_config and isinstance(sheets_config, dict) and sheets_config.get('sheet_id') and sheets_config.get('credentials_json_base64'):
                await log("📊 Exporting to Google Sheets...")
                await emitter.emit_progress(90, 100, current={"step": "exporting_sheets"})
                
                # Convert feed items to legacy format
                legacy_products = feed_items_to_legacy_dict(feed_items, config)
                
                # Export to sheets
                sheets_success, sheets_message, rows_added = await export_to_sheets(
                    legacy_products,
                    config,
                    sheets_config,
                    log_callback=log,
                    cancel_check=cancel_check
                )
                
                if sheets_success:
                    result['outputs']['sheets_rows_added'] = rows_added
                    await log(f"✅ Google Sheets export successful: {sheets_message}")
                else:
                    result['errors'].append(f"Google Sheets export failed: {sheets_message}")
                    await log(f"❌ Google Sheets export failed: {sheets_message}")
            else:
                error_msg = "Google Sheets export enabled but missing configuration (sheet_id or credentials_json_base64)"
                result['errors'].append(error_msg)
                await log(f"❌ {error_msg}")
                if sheets_config:
                    await log(f"🔍 Debug: sheets_config type = {type(sheets_config)}, value = {sheets_config}")
        
        result['success'] = True
        
        await emitter.emit_progress(100, 100, current={"step": "done"})
        await emitter.emit_status("done")
        
        await log("=" * 60)
        await log(f"📊 Result: ✅ Completed! Generated {len(feed_items)} items")
        await log("=" * 60)
        
        return result
        
    except Exception as e:
        error_msg = f"Unexpected error: {e}"
        result['errors'].append(error_msg)
        await log(f"❌ {error_msg}")
        import traceback
        await log(f"Traceback: {traceback.format_exc()}")
        await emitter.emit_status("failed")
        return result
