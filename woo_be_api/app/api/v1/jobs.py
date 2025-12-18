"""
Jobs API endpoints.
"""

import asyncio
import logging
import traceback
from fastapi import APIRouter, HTTPException, status, BackgroundTasks
from typing import Dict, Any, Optional

from app.deps import get_woo_client_for_store, get_redis, get_wp_client_for_store
from app.core.woo_client import WooClient
from app.core.wp_client import WPClient
from app.core.events import JobEventEmitter, JobStateManager
from app.schemas.jobs import (
    JobResponse, JobCreateResponse, JobProgress, JobMetrics, JobCurrent,
    BulkUpdateFieldsRequest
)
from app.schemas.prices import PriceUpdateRequest
from app.schemas.delete import DeleteProductsRequest
from app.schemas.bulk_update import BulkUpdateRequest
from app.schemas.csv_import import CSVImportRequest

router = APIRouter()


async def _run_job_task(
    job_id: str,
    store_id: str,
    job_type: str,
    params: Dict[str, Any]
):
    """Background task to run job."""
    logger = logging.getLogger(__name__)
    
    try:
        logger.info(f"Starting background job: {job_id}, type: {job_type}, store: {store_id}")
        
        redis = await get_redis()
        client = get_woo_client_for_store(store_id)
        emitter = JobEventEmitter(redis, job_id)
        state_manager = JobStateManager(redis)
        
        wp_client = None
        try:
            # Get WP client if needed
            if params.get("options", {}).get("delete_media", False):
                try:
                    wp_client = get_wp_client_for_store(store_id)
                except:
                    pass  # WP client optional
            
            logger.info(f"Job {job_id}: Executing job type: {job_type}")
            
            if job_type == "delete-products":
                from app.core.ops.delete_products import run_delete_products_job
                await run_delete_products_job(
                    client, wp_client, emitter, state_manager, job_id,
                    params["mode"],
                    params.get("urls"),
                    params.get("category_ids"),
                    params.get("options", {})
                )
            elif job_type == "update-prices":
                from app.core.ops.update_prices import run_update_prices_job
                await run_update_prices_job(
                    client, emitter, state_manager, job_id,
                    params["category_id"],
                    params["adjustment_type"],
                    params["adjustment_mode"],
                    params["adjustment_value"],
                    params.get("options", {})
                )
            elif job_type == "bulk-update":
                from app.core.ops.bulk_update import run_bulk_update_job
                # Extract update options and job options from params
                # Params structure: mode, urls, category_ids, update_title, prefix, suffix, ..., options: {...}
                update_params = {k: v for k, v in params.items() if k not in ("mode", "urls", "category_ids")}
                logger.info(f"Job {job_id}: Calling run_bulk_update_job with mode={params.get('mode')}, update_params keys={list(update_params.keys())}")
                await run_bulk_update_job(
                    client, emitter, state_manager, job_id,
                    params["mode"],
                    params.get("urls"),
                    params.get("category_ids"),
                    update_params
                )
            elif job_type == "csv-import":
                from app.core.ops.csv_import import run_csv_import_job
                wp_client = None
                try:
                    wp_client = get_wp_client_for_store(store_id)
                except:
                    pass  # WP client optional
                await run_csv_import_job(
                    client, wp_client, emitter, state_manager, job_id,
                    params["csv_content"],
                    params.get("category_id"),
                    params.get("tag"),
                    params.get("options", {})
                )
            elif job_type == "bulk-update-fields":
                from app.core.ops.bulk_update_fields import run_bulk_update_fields_job
                await run_bulk_update_fields_job(
                    client, emitter, state_manager, job_id,
                    params["scope"],
                    params["patch"],
                    params["options"]
                )
            else:
                error_msg = f"Unknown job type: {job_type}"
                logger.error(f"Job {job_id}: {error_msg}")
                await emitter.emit_log("error", error_msg)
                await emitter.emit_status("failed", total=0)
                
        except Exception as e:
            error_trace = traceback.format_exc()
            logger.error(f"Job {job_id} failed with exception: {str(e)}\n{error_trace}")
            await emitter.emit_log("error", f"Job failed: {str(e)}")
            await emitter.emit_status("failed", total=0)
            raise
        finally:
            try:
                await client.close()
                if wp_client:
                    await wp_client.close()
            except Exception as e:
                logger.warning(f"Error closing clients for job {job_id}: {str(e)}")
                
    except Exception as e:
        error_trace = traceback.format_exc()
        logger.error(f"Critical error in background task for job {job_id}: {str(e)}\n{error_trace}")
        # Try to update job status if emitter is available
        try:
            redis = await get_redis()
            emitter = JobEventEmitter(redis, job_id)
            await emitter.emit_log("error", f"Critical error: {str(e)}")
            await emitter.emit_status("failed", total=0)
        except:
            pass  # If we can't even log, just fail silently


@router.post("/delete-products", response_model=JobCreateResponse)
async def create_delete_products_job(
    store_id: str,
    request: DeleteProductsRequest,
    background_tasks: BackgroundTasks
):
    """Create delete products job matching desktop app schema."""
    try:
        redis = await get_redis()
        # Test Redis connection
        await redis.ping()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Redis connection failed: {str(e)}"
        )
    
    state_manager = JobStateManager(redis)
    
    # Validate request based on mode
    if request.mode == "urls" and not request.urls:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="urls is required when mode='urls'"
        )
    
    if request.mode == "categories" and not request.category_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="category_ids is required when mode='categories'"
        )
    
    try:
        job_id = await state_manager.create_job(
            store_id=store_id,
            job_type="delete-products",
            params={
                "mode": request.mode,
                "urls": request.urls,
                "category_ids": request.category_ids,
                "options": request.options.dict()
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create job: {str(e)}"
        )
    
    # Start job in background
    background_tasks.add_task(
        _run_job_task,
        job_id=job_id,
        store_id=store_id,
        job_type="delete-products",
        params={
            "mode": request.mode,
            "urls": request.urls,
            "category_ids": request.category_ids,
            "options": request.options.dict()
        }
    )
    
    return JobCreateResponse(job_id=job_id, status="queued")


@router.post("/update-prices", response_model=JobCreateResponse)
async def create_update_prices_job(
    store_id: str,
    request: PriceUpdateRequest,
    background_tasks: BackgroundTasks
):
    """Create update prices job matching desktop app schema."""
    try:
        redis = await get_redis()
        # Test Redis connection
        await redis.ping()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Redis connection failed: {str(e)}"
        )
    
    state_manager = JobStateManager(redis)
    
    try:
        job_id = await state_manager.create_job(
            store_id=store_id,
            job_type="update-prices",
            params={
                "category_id": request.category_id,
                "adjustment_type": request.adjustment_type,
                "adjustment_mode": request.adjustment_mode,
                "adjustment_value": request.adjustment_value,
                "options": request.options.dict()
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create job: {str(e)}"
        )
    
    # Start job in background
    background_tasks.add_task(
        _run_job_task,
        job_id=job_id,
        store_id=store_id,
        job_type="update-prices",
        params={
            "category_id": request.category_id,
            "adjustment_type": request.adjustment_type,
            "adjustment_mode": request.adjustment_mode,
            "adjustment_value": request.adjustment_value,
            "options": request.options.dict()
        }
    )
    
    return JobCreateResponse(job_id=job_id, status="queued")


@router.post("/bulk-update-fields", response_model=JobCreateResponse)
async def create_bulk_update_fields_job(
    store_id: str,
    request: BulkUpdateFieldsRequest,
    background_tasks: BackgroundTasks
):
    """Create bulk update fields job."""
    redis = await get_redis()
    state_manager = JobStateManager(redis)
    
    job_id = await state_manager.create_job(
        store_id=store_id,
        job_type="bulk-update-fields",
        params={
            "scope": request.scope.dict(),
            "patch": request.patch,
            "options": request.options.dict()
        }
    )
    
    # Start job in background
    background_tasks.add_task(
        _run_job_task,
        job_id=job_id,
        store_id=store_id,
        job_type="bulk-update-fields",
        params={
            "scope": request.scope.dict(),
            "patch": request.patch,
            "options": request.options.dict()
        }
    )
    
    return JobCreateResponse(job_id=job_id, status="queued")


@router.post("/bulk-update", response_model=JobCreateResponse)
async def create_bulk_update_job(
    store_id: str,
    request: BulkUpdateRequest,
    background_tasks: BackgroundTasks
):
    """Create bulk update job matching desktop app schema."""
    try:
        redis = await get_redis()
        await redis.ping()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Redis connection failed: {str(e)}"
        )
    
    state_manager = JobStateManager(redis)
    
    # Validate request
    if request.mode == "urls":
        if not request.urls or len(request.urls) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="urls is required and must not be empty when mode='urls'"
            )
    
    if request.mode == "categories":
        if not request.category_ids or len(request.category_ids) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="category_ids is required and must not be empty when mode='categories'"
            )
    
    # Validate at least one update is enabled
    if not request.update_title and not request.update_short_description and not request.update_description:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one update option must be enabled (update_title, update_short_description, or update_description)"
        )
    
    logger = logging.getLogger(__name__)
    
    try:
        job_params = {
            "mode": request.mode,
            "urls": request.urls,
            "category_ids": request.category_ids,
            "update_title": request.update_title,
            "prefix": request.prefix,
            "suffix": request.suffix,
            "avoid_duplicate_title": request.avoid_duplicate_title,
            "update_short_description": request.update_short_description,
            "short_template": request.short_template,
            "update_description": request.update_description,
            "description_mode": request.description_mode,
            "description_template": request.description_template,
            "use_marker_for_description": request.use_marker_for_description,
            "options": request.options.dict()
        }
        logger.info(f"Creating bulk-update job for store {store_id} with params: mode={request.mode}, update_title={request.update_title}, update_short_description={request.update_short_description}, update_description={request.update_description}")
        
        job_id = await state_manager.create_job(
            store_id=store_id,
            job_type="bulk-update",
            params=job_params
        )
        
        logger.info(f"Created job {job_id} for bulk-update")
    except Exception as e:
        error_trace = traceback.format_exc()
        logger.error(f"Failed to create bulk-update job: {str(e)}\n{error_trace}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create job: {str(e)}"
        )
    
    # Start job in background
    background_params = {
        "mode": request.mode,
        "urls": request.urls,
        "category_ids": request.category_ids,
        "update_title": request.update_title,
        "prefix": request.prefix,
        "suffix": request.suffix,
        "avoid_duplicate_title": request.avoid_duplicate_title,
        "update_short_description": request.update_short_description,
        "short_template": request.short_template,
        "update_description": request.update_description,
        "description_mode": request.description_mode,
        "description_template": request.description_template,
        "use_marker_for_description": request.use_marker_for_description,
        "options": request.options.dict()
    }
    
    logger.info(f"Adding background task for job {job_id}")
    background_tasks.add_task(
        _run_job_task,
        job_id=job_id,
        store_id=store_id,
        job_type="bulk-update",
        params=background_params
    )
    
    logger.info(f"Bulk-update job {job_id} queued successfully")
    return JobCreateResponse(job_id=job_id, status="queued")


@router.post("/import-csv", response_model=JobCreateResponse)
async def create_csv_import_job(
    store_id: str,
    request: CSVImportRequest,
    background_tasks: BackgroundTasks
):
    """Create CSV import job matching desktop app schema."""
    try:
        redis = await get_redis()
        await redis.ping()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Redis connection failed: {str(e)}"
        )
    
    state_manager = JobStateManager(redis)
    
    try:
        job_id = await state_manager.create_job(
            store_id=store_id,
            job_type="csv-import",
            params={
                "csv_content": request.csv_content,
                "category_id": request.category_id,
                "tag": request.tag,
                "options": request.options
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create job: {str(e)}"
        )
    
    # Start job in background
    background_tasks.add_task(
        _run_job_task,
        job_id=job_id,
        store_id=store_id,
        job_type="csv-import",
        params={
            "csv_content": request.csv_content,
            "category_id": request.category_id,
            "tag": request.tag,
            "options": request.options
        }
    )
    
    return JobCreateResponse(job_id=job_id, status="queued")


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(store_id: str, job_id: str):
    """Get job status."""
    try:
        redis = await get_redis()
        # Test Redis connection
        await redis.ping()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Redis connection failed: {str(e)}"
        )
    
    try:
        state_manager = JobStateManager(redis)
        state = await state_manager.get_job_state(job_id)
        
        if not state:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Job {job_id} not found"
            )
        
        # Verify store_id matches
        if state.get("store_id") != store_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Job {job_id} not found for store {store_id}"
            )
        
        # Parse progress/metrics/current
        progress = None
        if "progress" in state and isinstance(state["progress"], dict):
            progress = JobProgress(**state["progress"])
        elif "progress" in state and isinstance(state["progress"], str):
            import json
            try:
                progress = JobProgress(**json.loads(state["progress"]))
            except:
                pass
        
        metrics = None
        if "metrics" in state:
            if isinstance(state["metrics"], dict):
                metrics = JobMetrics(**state["metrics"])
            elif isinstance(state["metrics"], str):
                import json
                try:
                    metrics = JobMetrics(**json.loads(state["metrics"]))
                except:
                    pass
        
        current = None
        if "current" in state:
            if isinstance(state["current"], dict):
                current = JobCurrent(**state["current"])
            elif isinstance(state["current"], str):
                import json
                try:
                    current = JobCurrent(**json.loads(state["current"]))
                except:
                    pass
        
        return JobResponse(
            job_id=state.get("job_id", job_id),
            status=state.get("status", "unknown"),
            progress=progress,
            metrics=metrics,
            current=current,
            started_at=state.get("started_at"),
            updated_at=state.get("updated_at")
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching job status: {str(e)}"
        )


@router.post("/{job_id}/pause")
async def pause_job(store_id: str, job_id: str):
    """Pause a job."""
    redis = await get_redis()
    state_manager = JobStateManager(redis)
    
    state = await state_manager.get_job_state(job_id)
    if not state or state.get("store_id") != store_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found"
        )
    
    # Set pause flag
    await redis.set(f"job:{job_id}:pause", "1", ex=86400)
    await state_manager.get_job_state(job_id)  # Update state
    
    return {"status": "paused", "message": "Job đã tạm dừng"}


@router.post("/{job_id}/resume")
async def resume_job(store_id: str, job_id: str):
    """Resume a paused job."""
    redis = await get_redis()
    state_manager = JobStateManager(redis)
    
    state = await state_manager.get_job_state(job_id)
    if not state or state.get("store_id") != store_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found"
        )
    
    # Remove pause flag
    await redis.delete(f"job:{job_id}:pause")
    
    return {"status": "running", "message": "Job đã tiếp tục"}


@router.post("/{job_id}/stop")
async def stop_job(store_id: str, job_id: str):
    """Stop a job (alias for cancel)."""
    return await cancel_job(store_id, job_id)


@router.post("/{job_id}/cancel")
async def cancel_job(store_id: str, job_id: str):
    """Cancel a job."""
    redis = await get_redis()
    state_manager = JobStateManager(redis)
    
    state = await state_manager.get_job_state(job_id)
    if not state or state.get("store_id") != store_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found"
        )
    
    success = await state_manager.cancel_job(job_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to cancel job"
        )
    
    return {"status": "cancelled", "message": "Job đã dừng"}

