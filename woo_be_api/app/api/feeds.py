"""
Feed generation API endpoints.
"""

import os
import asyncio
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, status, BackgroundTasks, Header, Depends, Request, Query
from fastapi.responses import FileResponse, StreamingResponse

from app.deps import get_woo_client_for_store, get_redis, get_store_by_id
from app.core.woo_client import WooClient
from app.core.events import JobEventEmitter, JobStateManager
from app.core.feed.service import generate_feed
from app.core.feed.models import FeedConfig
from app.schemas.feed import FeedJobCreate, FeedJobResponse
from app.schemas.jobs import JobResponse, JobProgress, JobMetrics

router = APIRouter(prefix="/stores/{store_id}/feeds", tags=["Feeds"])

logger = logging.getLogger(__name__)


def _get_client_session(request: Request) -> Optional[str]:
    """Extract X-Client-Session header."""
    return request.headers.get("X-Client-Session")


async def _assert_job_access(
    job_id: str,
    store_id: str,
    effective_session: Optional[str],
    state_manager: JobStateManager
) -> None:
    """
    Unified helper to assert job access (store_id + session ownership).
    Raises 403 or 404 if access denied.
    
    Args:
        job_id: Job ID
        store_id: Store ID from route
        effective_session: Client session from header or query param
        state_manager: JobStateManager instance
    
    Raises:
        HTTPException: 404 if job not found or store mismatch, 403 if session mismatch
    """
    import logging
    import secrets
    
    logger = logging.getLogger(__name__)
    
    # Get job state
    state = await state_manager.get_job_state(job_id)
    if not state:
        logger.debug(f"Job access denied: job_id={job_id} not found")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found"
        )
    
    # Check store_id match
    job_store_id = state.get("store_id")
    if job_store_id != store_id:
        logger.debug(
            f"Job access denied: store_id mismatch | "
            f"path_store_id={store_id} | job_store_id={job_store_id} | job_id={job_id}"
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found"
        )
    
    # Check session ownership
    stored_session = state.get("client_session")
    if stored_session:
        # Job has session requirement - must match
        if not effective_session:
            logger.warning(
                f"[FEEDS ACCESS] Denied: session required but missing | "
                f"job_id={job_id} | store_id={store_id} | "
                f"job_store_id={job_store_id}"
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="client_session required"
            )
        
        if not secrets.compare_digest(effective_session, stored_session):
            logger.warning(
                f"[FEEDS ACCESS] Denied: session mismatch | "
                f"job_id={job_id} | path_store_id={store_id} | job_store_id={job_store_id} | "
                f"effective_session={effective_session[:16] if effective_session else 'None'}... | "
                f"stored_session={stored_session[:16]}..."
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Client session does not match job",
                headers={"X-Error-Code": "invalid_client_session"}
            )
    # If job has no session stored, allow access (backward compatibility for old jobs)


def _build_feed_config(
    store_id: str,
    request: FeedJobCreate,
    store_config: Dict[str, Any]
) -> FeedConfig:
    """Build FeedConfig from request and store config."""
    # Get store credentials
    store_url = store_config.get("store_url", "")
    consumer_key = store_config.get("consumer_key", "")
    consumer_secret = store_config.get("consumer_secret", "")
    store_name = store_config.get("store_name", store_id)
    
    # Build filters
    woocommerce_category_id = request.filters.category_id
    product_limit = request.filters.product_limit or 0
    after_date = request.filters.after_date.isoformat() if request.filters.after_date else None
    specific_product_ids = request.filters.product_ids
    
    # Build defaults
    google_shopping_category_id = request.defaults.google_category or ""
    google_product_type_default = request.defaults.product_type or "General Merchandise"
    gender = request.defaults.gender
    age_group = request.defaults.age_group
    
    # Output settings - use job-specific directory
    # Will be set in _run_feed_job_task with job_id
    output_folder = "/data/feeds"  # Base path, will be updated with store_id/job_id
    output_filename = "google_shopping_feed.xml"
    
    return FeedConfig(
        store_url=store_url,
        consumer_key=consumer_key,
        consumer_secret=consumer_secret,
        store_name=store_name,
        woocommerce_category_id=woocommerce_category_id,
        product_limit=product_limit,
        after_date=after_date,
        specific_product_ids=specific_product_ids,
        google_shopping_category_id=google_shopping_category_id,
        google_product_type_default=google_product_type_default,
        gender=gender,
        age_group=age_group,
        output_folder=output_folder,
        output_filename=output_filename,
        auto_rename=False  # Don't auto-rename in backend
    )


async def _run_feed_job_task(
    job_id: str,
    store_id: str,
    config_dict: Dict[str, Any],
    client_session: Optional[str]
):
    """Background task to run feed generation job."""
    try:
        logger.info(f"Starting feed job: {job_id}, store: {store_id}")
        
        redis = await get_redis()
        client = get_woo_client_for_store(store_id)
        emitter = JobEventEmitter(redis, job_id)
        state_manager = JobStateManager(redis)
        
        # Check cancel flag (sync wrapper for async check)
        # Note: This is a simplified version - in production you'd want a better cancel mechanism
        _cancelled = False
        async def update_cancel_flag():
            nonlocal _cancelled
            _cancelled = await state_manager.is_cancelled(job_id)
        
        def cancel_check() -> bool:
            # Update flag periodically (simplified - in production use proper async sync)
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    # Can't use run_until_complete in running loop
                    # For now, return cached value
                    return _cancelled
                else:
                    _cancelled = asyncio.run(state_manager.is_cancelled(job_id))
                    return _cancelled
            except:
                return False
        
        # Rebuild FeedConfig from dict
        store_config = get_store_by_id(store_id)
        
        # Set output folder to store_id/job_id specific path
        output_dir = Path(f"/data/feeds/{store_id}/{job_id}")
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Get channel from config
        channel = config_dict.get('channel', 'gmc')
        
        feed_config = FeedConfig(
            store_url=config_dict['store_url'],
            consumer_key=config_dict['consumer_key'],
            consumer_secret=config_dict['consumer_secret'],
            store_name=config_dict['store_name'],
            woocommerce_category_id=config_dict.get('woocommerce_category_id'),
            product_limit=config_dict.get('product_limit', 0),
            after_date=config_dict.get('after_date'),
            specific_product_ids=config_dict.get('specific_product_ids'),
            google_shopping_category_id=config_dict.get('google_shopping_category_id', ''),
            google_product_type_default=config_dict.get('google_product_type_default', 'General Merchandise'),
            gender=config_dict.get('gender'),
            age_group=config_dict.get('age_group'),
            output_folder=str(output_dir),  # Keep for backward compatibility
            output_filename=config_dict.get('output_filename', 'google_shopping_feed.xml'),
            auto_rename=False
        )
        
        # Get export options from config
        export_options = config_dict.get('export', {})
        
        # Run feed generation
        result = await generate_feed(
            client,
            feed_config,
            channel,
            output_dir,
            emitter,
            cancel_check=cancel_check,
            export_options=export_options
        )
        
        # Store result in job state
        if result['success']:
            await state_manager.set_job_data(job_id, "outputs", result['outputs'])
            await state_manager.set_job_data(job_id, "items_count", result['items_count'])
        else:
            await state_manager.set_job_data(job_id, "errors", result['errors'])
        
        logger.info(f"Feed job {job_id} completed: success={result['success']}")
        
    except Exception as e:
        logger.error(f"Error in feed job {job_id}: {e}", exc_info=True)
        redis = await get_redis()
        emitter = JobEventEmitter(redis, job_id)
        await emitter.emit_log("ERROR", f"Job failed: {str(e)}")
        await emitter.emit_status("failed")


@router.post("/jobs", response_model=FeedJobResponse, status_code=status.HTTP_201_CREATED)
async def create_feed_job(
    store_id: str,
    request: FeedJobCreate,
    background_tasks: BackgroundTasks,
    x_client_session: Optional[str] = Header(None, alias="X-Client-Session"),
    x_store_key: Optional[str] = Header(None, alias="X-Store-Key")
):
    """
    Create a feed generation job.
    
    Requires X-Store-Key header and optionally X-Client-Session for multi-user safety.
    """
    try:
        # Verify store
        from app.core.auth import verify_store_key
        store_config = await verify_store_key(store_id, x_store_key)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error verifying store: {str(e)}"
        )
    
    # Validate required fields
    if not request.defaults.google_category:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="google_category is required in defaults"
        )
    
    # Check Redis
    try:
        redis = await get_redis()
        await redis.ping()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Redis connection failed: {str(e)}"
        )
    
    # Build FeedConfig for snapshot
    feed_config = _build_feed_config(store_id, request, store_config)
    
    # Create config snapshot (serialize FeedConfig to dict)
    config_snapshot = {
        'store_url': feed_config.store_url,
        'consumer_key': feed_config.consumer_key,
        'consumer_secret': feed_config.consumer_secret,
        'store_name': feed_config.store_name,
        'woocommerce_category_id': feed_config.woocommerce_category_id,
        'product_limit': feed_config.product_limit,
        'after_date': feed_config.after_date,
        'specific_product_ids': feed_config.specific_product_ids,
        'google_shopping_category_id': feed_config.google_shopping_category_id,
        'google_product_type_default': feed_config.google_product_type_default,
        'gender': feed_config.gender,
        'age_group': feed_config.age_group,
        'output_folder': feed_config.output_folder,
        'output_filename': feed_config.output_filename,
        'channel': request.channel,
        'export': request.export.model_dump()
    }
    
    # Create job
    state_manager = JobStateManager(redis)
    job_id, job_token = await state_manager.create_job(
        store_id=store_id,
        job_type="feed-generation",
        params=config_snapshot,
        client_session=x_client_session
    )
    
    # Start background task
    background_tasks.add_task(
        _run_feed_job_task,
        job_id,
        store_id,
        config_snapshot,
        x_client_session
    )
    
    # Build URLs
    base_url = os.getenv("API_BASE_URL", "http://localhost:8000")
    # Use correct v2 feeds endpoint
    sse_url = f"{base_url}/api/v2/stores/{store_id}/feeds/jobs/{job_id}/events?token={job_token}"
    download_url = f"{base_url}/api/v2/stores/{store_id}/feeds/jobs/{job_id}/download"
    
    return FeedJobResponse(
        job_id=job_id,
        status="queued",
        sse_url=sse_url,
        download_url=download_url,
        token=job_token  # Include token for frontend to use in SSE
    )


@router.get("/jobs")
async def list_feed_jobs(
    store_id: str,
    x_client_session: Optional[str] = Header(None, alias="X-Client-Session"),
    x_store_key: Optional[str] = Header(None, alias="X-Store-Key"),
    limit: int = Query(50, ge=1, le=100)
):
    """
    List feed jobs for a store.
    Filters by client_session if provided.
    """
    try:
        from app.core.auth import verify_store_key
        await verify_store_key(store_id, x_store_key)
    except HTTPException:
        raise
    
    try:
        redis = await get_redis()
        state_manager = JobStateManager(redis)
        
        # Scan for jobs matching store_id and job_type="feed-generation"
        # Note: This is a simplified approach - in production, maintain a sorted set per store
        jobs = []
        cursor = 0
        pattern = "job:*:state"
        
        while len(jobs) < limit:
            cursor, keys = await redis.scan(cursor, match=pattern, count=100)
            
            for key in keys:
                if len(jobs) >= limit:
                    break
                
                # Extract job_id from key (format: job:{job_id}:state)
                job_id = key.decode().split(':')[1] if isinstance(key, bytes) else key.split(':')[1]
                
                state = await state_manager.get_job_state(job_id)
                if not state:
                    continue
                
                # Filter by store_id and job_type
                if state.get("store_id") != store_id:
                    continue
                
                if state.get("job_type") != "feed-generation":
                    continue
                
                # Filter by client_session if provided
                if x_client_session:
                    stored_session = state.get("client_session")
                    if stored_session and stored_session != x_client_session:
                        continue
                
                # Build job response
                params = state.get("params", {})
                outputs = await state_manager.get_job_data(job_id, "outputs") or {}
                items_count = await state_manager.get_job_data(job_id, "items_count") or 0
                
                # Determine filename
                filename = None
                if outputs.get("zip_filename"):
                    filename = outputs["zip_filename"]
                elif outputs.get("xml_filename"):
                    filename = outputs["xml_filename"]
                
                # Get file size
                file_size = None
                if outputs.get("zip_path") and os.path.exists(outputs["zip_path"]):
                    file_size = os.path.getsize(outputs["zip_path"])
                elif outputs.get("xml_path") and os.path.exists(outputs["xml_path"]):
                    file_size = os.path.getsize(outputs["xml_path"])
                
                job_response = JobResponse(
                    job_id=job_id,
                    status=state.get("status", "unknown"),
                    progress=state.get("progress"),
                    metrics=state.get("metrics"),
                    current=state.get("current"),
                    started_at=state.get("created_at"),
                    updated_at=state.get("updated_at")
                )
                
                # Add custom fields for feeds
                job_dict = job_response.model_dump()
                job_dict["channel"] = params.get("channel")
                job_dict["filename"] = filename
                job_dict["size"] = file_size
                job_dict["items_count"] = items_count
                
                jobs.append(job_dict)
            
            if cursor == 0:
                break
        
        # Sort by created_at descending (newest first)
        jobs.sort(key=lambda x: x.get("started_at") or "", reverse=True)
        
        return jobs[:limit]
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error listing jobs: {str(e)}"
        )


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_feed_job(
    store_id: str,
    job_id: str,
    x_client_session: Optional[str] = Header(None, alias="X-Client-Session"),
    client_session: Optional[str] = Query(None, alias="client_session"),
    x_store_key: Optional[str] = Header(None, alias="X-Store-Key")
):
    """
    Get feed job details.
    Requires matching client_session (from header or query param).
    """
    try:
        from app.core.auth import verify_store_key
        await verify_store_key(store_id, x_store_key)
    except HTTPException:
        raise
    
    try:
        redis = await get_redis()
        state_manager = JobStateManager(redis)
        
        # Compute effective session (header or query param)
        effective_session = x_client_session or client_session
        
        # Assert job access (store_id + session ownership)
        await _assert_job_access(job_id, store_id, effective_session, state_manager)
        
        # Get job state (already verified by _assert_job_access)
        state = await state_manager.get_job_state(job_id)
        
        # Get progress
        progress = state.get("progress", {})
        if isinstance(progress, str):
            import json
            progress = json.loads(progress)
        
        # Get metrics
        metrics = state.get("metrics", {})
        if isinstance(metrics, str):
            import json
            metrics = json.loads(metrics)
        
        # Get outputs
        outputs = await state_manager.get_job_data(job_id, "outputs")
        items_count = await state_manager.get_job_data(job_id, "items_count")
        
        return JobResponse(
            job_id=job_id,
            store_id=store_id,
            job_type=state.get("job_type", "feed-generation"),
            status=state.get("status", "unknown"),
            progress=JobProgress(
                done=progress.get("done", 0),
                total=progress.get("total", 0),
                percent=progress.get("percent", 0)
            ) if progress else None,
            metrics=JobMetrics(
                success=metrics.get("success", 0),
                failed=metrics.get("failed", 0),
                retried=metrics.get("retried", 0),
                skipped=metrics.get("skipped", 0)
            ) if metrics else None,
            created_at=state.get("created_at"),
            updated_at=state.get("updated_at"),
            outputs=outputs,
            items_count=items_count
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting job: {str(e)}"
        )


@router.get("/jobs/{job_id}/events")
async def stream_feed_job_events(
    store_id: str,
    job_id: str,
    request: Request,
    token: Optional[str] = Query(None),
    x_client_session: Optional[str] = Header(None, alias="X-Client-Session"),
    client_session: Optional[str] = Query(None, alias="client_session"),
    last_event_id: Optional[str] = Query(None)
):
    """
    Stream feed job events via SSE.
    Requires job token and matching client_session.
    Supports client_session as query param (for EventSource which can't send headers).
    """
    try:
        redis = await get_redis()
        await redis.ping()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Redis connection failed: {str(e)}"
        )
    
    state_manager = JobStateManager(redis)
    
    # Compute effective session (header or query param) - do this first for better error messages
    effective_session = x_client_session or client_session
    
    # Assert job access first (store_id + session ownership) - unified check
    # This ensures session matches before we check token
    await _assert_job_access(job_id, store_id, effective_session, state_manager)
    
    # Token is preferred but optional if session matches (for existing jobs where token might not be available)
    if token:
        # If token is provided, verify it
        if not await state_manager.verify_job_token(job_id, token):
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(
                f"[FEEDS EVENTS] Invalid token | job_id={job_id} | store_id={store_id} | "
                f"effective_session={effective_session[:16] if effective_session else 'None'}..."
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid job token"
            )
        # Use verified token
        effective_token = token
    else:
        # No token provided, but session matches (verified by _assert_job_access)
        # Get token from job state for SSE stream
        state = await state_manager.get_job_state(job_id)
        effective_token = state.get("job_token") if state else None
        if not effective_token:
            # Fallback: create a temporary token or use job_id as token (less secure but allows access)
            # Since session is already verified, we can allow this
            import logging
            logger = logging.getLogger(__name__)
            logger.info(
                f"[FEEDS EVENTS] No token provided, using job token from state | job_id={job_id} | store_id={store_id}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Job token not available. Please provide token or recreate the job."
            )
    
    # Stream events (reuse existing SSE infrastructure)
    from app.api.v1.sse import _stream_events_impl
    return await _stream_events_impl(
        store_id=store_id,
        job_id=job_id,
        token=effective_token,
        request=request,
        last_event_id=last_event_id
    )


@router.get("/jobs/{job_id}/download")
async def download_feed_file(
    store_id: str,
    job_id: str,
    x_client_session: Optional[str] = Header(None, alias="X-Client-Session"),
    client_session: Optional[str] = Query(None, alias="client_session"),
    x_store_key: Optional[str] = Header(None, alias="X-Store-Key")
):
    """
    Download feed XML/ZIP file.
    Requires matching client_session (from header or query param).
    """
    try:
        from app.core.auth import verify_store_key
        await verify_store_key(store_id, x_store_key)
    except HTTPException:
        raise
    
    try:
        redis = await get_redis()
        state_manager = JobStateManager(redis)
        
        # Compute effective session (header or query param)
        effective_session = x_client_session or client_session
        
        # Assert job access (store_id + session ownership) - unified check
        await _assert_job_access(job_id, store_id, effective_session, state_manager)
        
        # Get job state (already verified by _assert_job_access)
        state = await state_manager.get_job_state(job_id)
        
        # Get outputs
        outputs = await state_manager.get_job_data(job_id, "outputs")
        if not outputs:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Feed file not found. Job may not be completed yet."
            )
        
        # Determine file path
        file_path = None
        filename = None
        
        if outputs.get("zip_path"):
            file_path = outputs["zip_path"]
            filename = outputs.get("zip_filename", "feed.zip")
        elif outputs.get("xml_path"):
            file_path = outputs["xml_path"]
            filename = outputs.get("xml_filename", "feed.xml")
        
        if not file_path or not os.path.exists(file_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Feed file not found on server"
            )
        
        # Determine media type
        if filename.endswith('.zip'):
            media_type = 'application/zip'
        else:
            media_type = 'application/xml'
        
        return FileResponse(
            path=file_path,
            filename=filename,
            media_type=media_type
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error downloading file: {str(e)}"
        )

