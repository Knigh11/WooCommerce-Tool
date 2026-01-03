"""
Server-Sent Events (SSE) endpoint for job events - Multi-user safe with token gating.
"""

from fastapi import APIRouter, Request, HTTPException, status, Header, Query
from fastapi.responses import StreamingResponse
from typing import Optional

from app.deps import get_redis
from app.core.events import stream_job_events, JobStateManager

router = APIRouter()


async def _stream_events_impl(
    store_id: str,
    job_id: str,
    token: str,
    request: Request,
    last_event_id: Optional[str] = None,
    store_key: Optional[str] = None
):
    """
    Internal implementation for streaming job events.
    Requires token verification. X-Store-Key is optional if token is valid.
    """
    try:
        redis = await get_redis()
        # Test Redis connection
        await redis.ping()
    except Exception as e:
        # If Redis is not available, return error immediately
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Redis connection failed: {str(e)}"
        )
    
    state_manager = JobStateManager(redis)
    
    # Verify job exists and belongs to store
    try:
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
        
        # X-Store-Key is optional for SSE if token is valid
        # But if provided, verify it matches
        if store_key:
            from app.core.auth import verify_store_key
            try:
                await verify_store_key(store_id, store_key)
            except HTTPException:
                # If key is provided but invalid, still allow if token is valid
                # This allows SSE to work without headers
                pass
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error checking job state: {str(e)}"
        )
    
    # Determine starting point
    start_id = last_event_id if last_event_id else "$"
    
    # Get current job state for snapshot
    current_state = await state_manager.get_job_state(job_id)
    
    async def event_generator():
        """Generate SSE events."""
        try:
            # Send initial connection event
            yield f"event: connected\ndata: {{\"job_id\": \"{job_id}\"}}\n\n"
            
            # Send snapshot event with current state
            if current_state:
                import json
                snapshot_data = {
                    "status": current_state.get("status", "unknown"),
                    "done": current_state.get("progress", {}).get("done", 0) if isinstance(current_state.get("progress"), dict) else 0,
                    "total": current_state.get("progress", {}).get("total", 0) if isinstance(current_state.get("progress"), dict) else 0
                }
                yield f"event: snapshot\ndata: {json.dumps(snapshot_data)}\n\n"
            
            async for event in stream_job_events(redis, job_id, start_id):
                # Check if client disconnected
                if await request.is_disconnected():
                    break
                
                # Format as SSE
                if event.get("event") == "comment":
                    # Heartbeat
                    yield f": {event.get('data', 'ping')}\n\n"
                elif event.get("event") == "error":
                    # Error event - send and break
                    yield f"event: error\ndata: {event.get('data', '{}')}\n\n"
                    break
                else:
                    lines = []
                    if event.get("id"):
                        lines.append(f"id: {event['id']}")
                    lines.append(f"event: {event.get('event', 'message')}")
                    lines.append(f"data: {event.get('data', '{}')}")
                    yield "\n".join(lines) + "\n\n"
        
        except Exception as e:
            # Send error event
            import json
            error_data = json.dumps({"error": str(e)})
            yield f"event: error\ndata: {error_data}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
            "Access-Control-Allow-Origin": "*",  # CORS for SSE
            "Access-Control-Allow-Headers": "Cache-Control, Last-Event-ID",
        }
    )


@router.get("")
async def stream_events(
    store_id: str,
    job_id: str,
    token: str = Query(..., description="Job token"),
    request: Request = None,
    last_event_id: Optional[str] = Header(None, alias="Last-Event-ID"),
    x_store_key: Optional[str] = Header(None, alias="X-Store-Key")
):
    """
    Stream job events via Server-Sent Events (SSE).
    Token is mandatory. X-Store-Key is optional (token provides security).
    
    Supports Last-Event-ID header for resuming from a specific event.
    Path: /stores/{store_id}/jobs/{job_id}/events?token=JOB_TOKEN
    """
    if request is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Request object not available"
        )
    return await _stream_events_impl(store_id, job_id, token, request, last_event_id, x_store_key)


# Export function for use in router (query param version)
async def stream_events_query(
    store_id: str,
    job_id: str = Query(..., description="Job ID"),
    token: str = Query(..., description="Job token"),
    request: Request = None,
    last_event_id: Optional[str] = Header(None, alias="Last-Event-ID"),
    x_store_key: Optional[str] = Header(None, alias="X-Store-Key")
):
    """
    Stream job events via Server-Sent Events (SSE) - query param version.
    Token is mandatory. X-Store-Key is optional (token provides security).
    
    Path: /stores/{store_id}/sse?job_id={job_id}&token=JOB_TOKEN
    """
    if request is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Request object not available"
        )
    return await _stream_events_impl(store_id, job_id, token, request, last_event_id, x_store_key)
