"""
V2 Description Builder API endpoints - Multi-user safe with token gating.
"""

import os
import tempfile
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException, status, UploadFile, File, BackgroundTasks, Query, Depends, Header
from fastapi.responses import FileResponse
from typing import Dict, Any, Optional

from app.deps import get_redis
from app.core.auth import get_verified_store
from app.core.events import JobEventEmitter, JobStateManager
from app.core.v2.zip_scanner import ZipWorkspaceScanner
from app.core.v2.upload_session import UploadSessionStore
from app.core.v2.rate_limit import RateLimiter
from app.core.v2.desc_template_engine import TemplateEngine
from app.core.v2.desc_presets import PresetManager
from app.core.v2.desc_generator import DescriptionGenerator
from app.schemas.v2.desc_builder import (
    UploadZipResponse, PreviewRequest, PreviewResponse,
    GenerateRequest, GenerateResponse, LeafItem,
    PresetListResponse, PresetInfo
)

router = APIRouter()

# Upload limit: 150MB
MAX_UPLOAD_SIZE = 150 * 1024 * 1024

# Data directory for temp files (should be mounted volume in Docker)
DATA_DIR = Path(os.getenv("DATA_DIR", tempfile.gettempdir())) / "desc_builder"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def _get_store_data_dir(store_id: str) -> Path:
    """Get data directory for a store."""
    store_dir = DATA_DIR / store_id
    store_dir.mkdir(parents=True, exist_ok=True)
    return store_dir


@router.post("/upload-zip", response_model=UploadZipResponse)
async def upload_zip(
    store_id: str,
    file: UploadFile = File(...),
    store: Dict = Depends(get_verified_store)
):
    """
    Upload ZIP file and scan for leaf folders.
    Requires X-Store-Key header.
    """
    redis = await get_redis()
    session_store = UploadSessionStore(redis)
    rate_limiter = RateLimiter(redis)
    
    # Acquire upload slot
    try:
        await rate_limiter.acquire_upload_slot(store_id)
    except HTTPException:
        raise
    
    try:
        # Check file size
        file_content = await file.read()
        file_size = len(file_content)
        
        if file_size > MAX_UPLOAD_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File too large. Maximum size: {MAX_UPLOAD_SIZE / (1024*1024):.0f}MB"
            )
        
        if file_size == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Empty file"
            )
        
        # Save to store-specific directory
        upload_id = str(uuid.uuid4())
        store_dir = _get_store_data_dir(store_id)
        upload_dir = store_dir / upload_id
        upload_dir.mkdir(parents=True, exist_ok=True)
        temp_zip_path = upload_dir / "input.zip"
        
        try:
            with open(temp_zip_path, 'wb') as f:
                f.write(file_content)
            
            # Scan ZIP
            scanner = ZipWorkspaceScanner(str(temp_zip_path))
            root_name, multiple_roots, items, summary = scanner.scan()
            
            # Convert to response format
            leaf_items = [
                LeafItem(
                    id=item.id,
                    rel_path=item.rel_path,
                    title=item.title,
                    category=item.category,
                    has_description=item.has_description
                )
                for item in items
            ]
            
            # Store session in Redis
            upload_id, upload_token = await session_store.create_session(
                store_id=store_id,
                zip_path=str(temp_zip_path),
                root_name=root_name,
                multiple_roots=multiple_roots,
                zip_size=file_size,
                items=items
            )
            
            return UploadZipResponse(
                upload_id=upload_id,
                upload_token=upload_token,
                root_name=root_name,
                multiple_roots=multiple_roots,
                zip_size=file_size,
                items=leaf_items,
                summary=summary
            )
            
        except ValueError as e:
            # Clean up on error
            if temp_zip_path.exists():
                try:
                    temp_zip_path.unlink()
                except:
                    pass
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )
        except Exception as e:
            # Clean up on error
            if temp_zip_path.exists():
                try:
                    temp_zip_path.unlink()
                except:
                    pass
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error processing ZIP: {str(e)}"
            )
        finally:
            # Release upload slot
            await rate_limiter.release_upload_slot(store_id)
    
    except HTTPException:
        await rate_limiter.release_upload_slot(store_id)
        raise
    except Exception as e:
        await rate_limiter.release_upload_slot(store_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error: {str(e)}"
        )


@router.get("/presets", response_model=PresetListResponse)
async def list_presets(
    store_id: str,
    store: Dict = Depends(get_verified_store)
):
    """
    List all available presets for the store.
    Requires X-Store-Key header.
    """
    try:
        preset_manager = PresetManager()
        template_engine = TemplateEngine()
        
        # Get all presets
        presets_data = preset_manager.get_all_presets(store_id=store_id)
        
        # Convert to response format
        presets = [
            PresetInfo(
                category_key=p["category_key"],
                display_name=p["display_name"],
                product_type=p.get("product_type", ""),
                fit=p.get("fit", ""),
                use=p.get("use", ""),
                seo_keywords=p.get("seo_keywords", [])
            )
            for p in presets_data
        ]
        
        return PresetListResponse(
            presets=presets,
            default_template=template_engine.DEFAULT_TEMPLATE
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error listing presets: {str(e)}"
        )


@router.get("/presets/{category_key}", response_model=PresetInfo)
async def get_preset(
    store_id: str,
    category_key: str,
    store: Dict = Depends(get_verified_store)
):
    """
    Get preset by category key.
    Requires X-Store-Key header.
    """
    try:
        preset_manager = PresetManager()
        preset_data = preset_manager.get_preset_by_key(category_key, store_id=store_id)
        
        if not preset_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Preset '{category_key}' not found"
            )
        
        return PresetInfo(
            category_key=preset_data["category_key"],
            display_name=preset_data["display_name"],
            product_type=preset_data.get("product_type", ""),
            fit=preset_data.get("fit", ""),
            use=preset_data.get("use", ""),
            seo_keywords=preset_data.get("seo_keywords", [])
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting preset: {str(e)}"
        )


@router.post("/preview", response_model=PreviewResponse)
async def preview_description(
    store_id: str,
    request: PreviewRequest,
    store: Dict = Depends(get_verified_store)
):
    """
    Preview description for a single leaf folder.
    Requires X-Store-Key header and upload_token.
    """
    redis = await get_redis()
    session_store = UploadSessionStore(redis)
    
    # Get upload session (verifies token)
    session = await session_store.get_session(
        store_id=store_id,
        upload_id=request.upload_id,
        upload_token=request.upload_token
    )
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Upload session {request.upload_id} not found or expired"
        )
    
    # Find item
    items = session["items"]
    item = None
    for it in items:
        if it.rel_path == request.rel_path:
            item = it
            break
    
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Leaf folder {request.rel_path} not found in upload"
        )
    
    try:
        # Initialize services
        preset_manager = PresetManager()
        template_engine = TemplateEngine()
        generator = DescriptionGenerator(preset_manager, template_engine)
        
        # Generate preview
        config_dict = request.config.model_dump(exclude_none=True)
        success, message, description = generator.generate_one(
            item,
            config_dict,
            store_id=store_id
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=message
            )
        
        return PreviewResponse(text=description)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating preview: {str(e)}"
        )


@router.post("/generate", response_model=GenerateResponse)
async def generate_descriptions(
    store_id: str,
    request: GenerateRequest,
    background_tasks: BackgroundTasks,
    store: Dict = Depends(get_verified_store)
):
    """
    Generate descriptions for selected leaf folders (background job).
    Requires X-Store-Key header and upload_token.
    """
    try:
        redis = await get_redis()
        await redis.ping()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Redis connection failed: {str(e)}"
        )
    
    session_store = UploadSessionStore(redis)
    rate_limiter = RateLimiter(redis)
    
    # Get upload session (verifies token)
    session = await session_store.get_session(
        store_id=store_id,
        upload_id=request.upload_id,
        upload_token=request.upload_token
    )
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Upload session {request.upload_id} not found or expired"
        )
    
    # Acquire job slot
    try:
        await rate_limiter.acquire_job_slot(store_id)
    except HTTPException:
        raise
    
    # Validate rel_paths
    items = session["items"]
    item_map = {it.rel_path: it for it in items}
    selected_items = []
    for rel_path in request.rel_paths:
        if rel_path not in item_map:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Leaf folder {rel_path} not found in upload"
            )
        selected_items.append(item_map[rel_path])
    
    # Create job
    state_manager = JobStateManager(redis)
    config_dict = request.config.model_dump(exclude_none=True)
    job_id, job_token = await state_manager.create_job(
        store_id=store_id,
        job_type="desc-builder-generate",
        params={
            "upload_id": request.upload_id,
            "rel_paths": request.rel_paths,
            "config": config_dict,
            "overwrite": request.overwrite,
            "root_name": session["root_name"]
        }
    )
    
    # Start background task
    background_tasks.add_task(
        _run_generation_job,
        job_id=job_id,
        store_id=store_id,
        upload_id=request.upload_id,
        rel_paths=request.rel_paths,
        config=config_dict,
        overwrite=request.overwrite,
        rate_limiter=rate_limiter
    )
    
    return GenerateResponse(job_id=job_id, job_token=job_token)


async def _run_generation_job(
    job_id: str,
    store_id: str,
    upload_id: str,
    rel_paths: list[str],
    config: Dict[str, Any],
    overwrite: bool,
    rate_limiter: RateLimiter
):
    """Background task to run generation job."""
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        redis = await get_redis()
        emitter = JobEventEmitter(redis, job_id)
        state_manager = JobStateManager(redis)
        session_store = UploadSessionStore(redis)
        
        # Emit initial status
        await emitter.emit_status("queued", total=0)
        
        # Get upload session
        session = await session_store.get_session(store_id=store_id, upload_id=upload_id)
        if not session:
            raise ValueError("Upload session not found or expired")
        
        items = session["items"]
        item_map = {it.rel_path: it for it in items}
        selected_items = [item_map[rel_path] for rel_path in rel_paths if rel_path in item_map]
        root_name = session["root_name"]
        zip_path = session["zip_path"]
        
        # Update status to running
        await emitter.emit_status("running", total=len(selected_items))
        await emitter.emit_log("info", f"Starting generation for {len(selected_items)} items")
        
        # Initialize services
        preset_manager = PresetManager()
        template_engine = TemplateEngine()
        generator = DescriptionGenerator(preset_manager, template_engine)
        
        # Generate descriptions
        descriptions: Dict[str, str] = {}
        success_count = 0
        fail_count = 0
        
        for idx, item in enumerate(selected_items):
            try:
                success, message, description = generator.generate_one(
                    item,
                    config,
                    store_id=store_id
                )
                
                if success:
                    descriptions[item.rel_path] = description
                    success_count += 1
                    await emitter.emit_log("info", f"✅ {message}")
                else:
                    fail_count += 1
                    await emitter.emit_log("error", f"❌ {message}")
                
                # Update progress every 5 items
                if (idx + 1) % 5 == 0 or idx == len(selected_items) - 1:
                    await emitter.emit_progress(
                        done=idx + 1,
                        total=len(selected_items),
                        success=success_count,
                        failed=fail_count,
                        current={"rel_path": item.rel_path}
                    )
                    
            except Exception as e:
                fail_count += 1
                await emitter.emit_log("error", f"❌ Error processing {item.rel_path}: {str(e)}")
        
        # Create ZIP patch
        if descriptions:
            store_dir = _get_store_data_dir(store_id)
            job_dir = store_dir / job_id
            job_dir.mkdir(parents=True, exist_ok=True)
            patch_zip_path = job_dir / "patch.zip"
            
            generator.create_patch_zip(
                items,
                descriptions,
                root_name,
                str(patch_zip_path)
            )
            
            # Store patch path in job state
            await state_manager.set_job_data(job_id, "patch_zip_path", str(patch_zip_path))
            
            await emitter.emit_log("info", f"✅ Created ZIP patch: {patch_zip_path.name}")
            await emitter.emit_status("done", total=len(selected_items))
        else:
            await emitter.emit_log("error", "No descriptions generated")
            await emitter.emit_status("failed", total=len(selected_items))
            
    except Exception as e:
        error_trace = str(e)
        logger.error(f"Job {job_id} failed: {error_trace}")
        try:
            await emitter.emit_log("error", f"Job failed: {error_trace}")
            await emitter.emit_status("failed", total=len(rel_paths))
        except:
            pass
    finally:
        # Release job slot
        try:
            await rate_limiter.release_job_slot(store_id)
        except:
            pass


@router.get("/download/{job_id}")
async def download_patch_zip(
    store_id: str,
    job_id: str,
    token: str = Query(..., description="Job token"),
    x_store_key: Optional[str] = Header(None, alias="X-Store-Key")
):
    """
    Download ZIP patch for completed job.
    Token is mandatory. X-Store-Key is optional (token provides security).
    """
    try:
        redis = await get_redis()
        state_manager = JobStateManager(redis)
        
        # Verify job and token
        state = await state_manager.get_job_state(job_id)
        if not state or state.get("store_id") != store_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Job {job_id} not found"
            )
        
        # Verify token (mandatory)
        if not token:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Missing job token",
                headers={"X-Error-Code": "missing_job_token"}
            )
        
        if not await state_manager.verify_job_token(job_id, token):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid job token",
                headers={"X-Error-Code": "invalid_job_token"}
            )
        
        # X-Store-Key is optional for download if token is valid
        # But if provided, verify it matches
        if x_store_key:
            from app.core.auth import verify_store_key
            try:
                await verify_store_key(store_id, x_store_key)
            except HTTPException:
                # If key is provided but invalid, still allow if token is valid
                # This allows download to work without headers
                pass
        
        # Get patch path
        patch_path = await state_manager.get_job_data(job_id, "patch_zip_path")
        if not patch_path:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="ZIP patch not available for this job"
            )
        
        patch_path = Path(patch_path)
        if not patch_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="ZIP patch file not found"
            )
        
        return FileResponse(
            path=str(patch_path),
            filename=f"description_patch_{job_id}.zip",
            media_type="application/zip"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error downloading patch: {str(e)}"
        )
