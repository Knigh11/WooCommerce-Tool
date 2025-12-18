"""
Server-Sent Events (SSE) endpoint for job events.
"""

from fastapi import APIRouter, Request, HTTPException, status, Header
from fastapi.responses import StreamingResponse
from typing import Optional

from app.deps import get_redis
from app.core.events import stream_job_events, JobStateManager

router = APIRouter()


@router.get("")
async def stream_events(
    store_id: str,
    job_id: str,
    request: Request,
    last_event_id: Optional[str] = Header(None, alias="Last-Event-ID")
):
    """
    Stream job events via Server-Sent Events (SSE).
    
    Supports Last-Event-ID header for resuming from a specific event.
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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error checking job state: {str(e)}"
        )
    
    # Determine starting point
    start_id = last_event_id if last_event_id else "$"
    
    async def event_generator():
        """Generate SSE events."""
        try:
            # Send initial connection event
            yield f"event: connected\ndata: {{\"job_id\": \"{job_id}\"}}\n\n"
            
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

