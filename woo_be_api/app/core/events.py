"""
Event system for job progress and logging using Redis Streams.
"""

import json
import time
import uuid
import asyncio
from typing import Dict, Optional, Any, AsyncIterator
from datetime import datetime
import redis.asyncio as aioredis


class JobEventEmitter:
    """Emit job events to Redis Streams for SSE consumption."""
    
    def __init__(self, redis_client: aioredis.Redis, job_id: str):
        """
        Initialize event emitter.
        
        Args:
            redis_client: Redis async client
            job_id: Job ID
        """
        self.redis = redis_client
        self.job_id = job_id
        self.stream_key = f"job:{job_id}:events"
        self.state_key = f"job:{job_id}:state"
    
    async def emit_status(self, status: str, total: Optional[int] = None):
        """
        Emit status event.
        
        Args:
            status: Job status (queued, running, done, failed, cancelled)
            total: Total items to process (optional)
        """
        event_data = {
            "event": "status",
            "data": json.dumps({
                "status": status,
                "total": total
            })
        }
        await self.redis.xadd(self.stream_key, event_data)
        await self._update_state({"status": status})
    
    async def emit_progress(
        self,
        done: int,
        total: int,
        success: int = 0,
        failed: int = 0,
        retried: int = 0,
        skipped: int = 0,
        current: Optional[Dict[str, Any]] = None
    ):
        """
        Emit progress event.
        
        Args:
            done: Number of items processed
            total: Total items
            success: Number of successful operations
            failed: Number of failed operations
            retried: Number of retried operations
            skipped: Number of skipped items
            current: Current item being processed (optional)
        """
        percent = int((done / total * 100)) if total > 0 else 0
        
        event_data = {
            "event": "progress",
            "data": json.dumps({
                "done": done,
                "total": total,
                "percent": percent,
                "success": success,
                "failed": failed,
                "retried": retried,
                "skipped": skipped,
                "current": current or {}
            })
        }
        await self.redis.xadd(self.stream_key, event_data)
        await self._update_state({
            "progress": {
                "done": done,
                "total": total,
                "percent": percent
            },
            "metrics": {
                "success": success,
                "failed": failed,
                "retried": retried,
                "skipped": skipped
            },
            "current": current or {}
        })
    
    async def emit_log(
        self,
        level: str,
        msg: str,
        product_id: Optional[int] = None
    ):
        """
        Emit log event.
        
        Args:
            level: Log level (INFO, WARN, ERROR)
            msg: Log message
            product_id: Optional product ID
        """
        event_data = {
            "event": "log",
            "data": json.dumps({
                "ts": datetime.utcnow().isoformat(),
                "level": level,
                "msg": msg,
                "product_id": product_id
            })
        }
        await self.redis.xadd(self.stream_key, event_data)
    
    async def _update_state(self, updates: Dict[str, Any]):
        """Update job state in Redis hash."""
        state = await self.redis.hgetall(self.state_key)
        if not state:
            state = {
                "job_id": self.job_id,
                "status": "queued",
                "started_at": datetime.utcnow().isoformat(),
            }
        
        # Convert dict/list values to JSON strings for Redis
        updates_serialized = {}
        for k, v in updates.items():
            if isinstance(v, (dict, list)):
                updates_serialized[k] = json.dumps(v)
            else:
                updates_serialized[k] = str(v) if v is not None else ""
        
        state.update(updates_serialized)
        state["updated_at"] = datetime.utcnow().isoformat()
        
        await self.redis.hset(self.state_key, mapping=state)
    
    async def set_metrics(self, metrics: Dict[str, int]):
        """Set job metrics."""
        await self._update_state({"metrics": metrics})
    
    async def set_current(self, current: Dict[str, Any]):
        """Set current item being processed."""
        await self._update_state({"current": current})


class JobStateManager:
    """Manage job state in Redis."""
    
    def __init__(self, redis_client: aioredis.Redis):
        """
        Initialize job state manager.
        
        Args:
            redis_client: Redis async client
        """
        self.redis = redis_client
    
    async def create_job(
        self,
        store_id: str,
        job_type: str,
        params: Dict[str, Any]
    ) -> str:
        """
        Create a new job.
        
        Args:
            store_id: Store ID
            job_type: Job type (delete-products, update-prices, etc.)
            params: Job parameters
        
        Returns:
            Job ID
        """
        job_id = str(uuid.uuid4())
        state_key = f"job:{job_id}:state"
        
        state = {
            "job_id": job_id,
            "store_id": store_id,
            "job_type": job_type,
            "status": "queued",
            "params": json.dumps(params),
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }
        
        await self.redis.hset(state_key, mapping=state)
        
        # Set TTL (24 hours)
        await self.redis.expire(state_key, 86400)
        
        return job_id
    
    async def get_job_state(self, job_id: str) -> Optional[Dict[str, Any]]:
        """
        Get job state.
        
        Args:
            job_id: Job ID
        
        Returns:
            Job state dict or None if not found
        """
        state_key = f"job:{job_id}:state"
        state = await self.redis.hgetall(state_key)
        
        if not state:
            return None
        
        # Parse JSON fields
        if "params" in state:
            try:
                state["params"] = json.loads(state["params"])
            except:
                pass
        
        if "metrics" in state:
            try:
                state["metrics"] = json.loads(state["metrics"])
            except:
                pass
        
        if "current" in state:
            try:
                state["current"] = json.loads(state["current"])
            except:
                pass
        
        if "progress" in state:
            try:
                state["progress"] = json.loads(state["progress"])
            except:
                pass
        
        return state
    
    async def cancel_job(self, job_id: str) -> bool:
        """
        Cancel a job.
        
        Args:
            job_id: Job ID
        
        Returns:
            True if cancelled, False if not found
        """
        state_key = f"job:{job_id}:state"
        exists = await self.redis.exists(state_key)
        
        if exists:
            await self.redis.hset(state_key, "status", "cancelled")
            await self.redis.hset(state_key, "updated_at", datetime.utcnow().isoformat())
            # Set cancel flag for worker to check
            await self.redis.set(f"job:{job_id}:cancel", "1", ex=86400)
            return True
        
        return False
    
    async def is_cancelled(self, job_id: str) -> bool:
        """Check if job is cancelled."""
        result = await self.redis.exists(f"job:{job_id}:cancel")
        return result > 0
    
    async def set_job_data(self, job_id: str, key: str, value: Any):
        """
        Set job data (for storing failed items, etc.).
        
        Args:
            job_id: Job ID
            key: Data key
            value: Data value (will be JSON serialized if dict/list)
        """
        state_key = f"job:{job_id}:state"
        data_key = f"job:{job_id}:data:{key}"
        
        if isinstance(value, (dict, list)):
            await self.redis.set(data_key, json.dumps(value), ex=86400)
        else:
            await self.redis.set(data_key, str(value), ex=86400)
    
    async def get_job_data(self, job_id: str, key: str) -> Optional[Any]:
        """
        Get job data.
        
        Args:
            job_id: Job ID
            key: Data key
        
        Returns:
            Data value or None if not found
        """
        data_key = f"job:{job_id}:data:{key}"
        value = await self.redis.get(data_key)
        
        if value is None:
            return None
        
        try:
            return json.loads(value)
        except:
            return value.decode() if isinstance(value, bytes) else value


async def stream_job_events(
    redis_client: aioredis.Redis,
    job_id: str,
    last_id: str = "$"
) -> AsyncIterator[Dict[str, Any]]:
    """
    Stream job events from Redis Streams (for SSE).
    
    Args:
        redis_client: Redis async client
        job_id: Job ID
        last_id: Last event ID to resume from (default: "$" for new only)
    
    Yields:
        Event dicts with 'event' and 'data' keys
    """
    stream_key = f"job:{job_id}:events"
    consecutive_errors = 0
    max_consecutive_errors = 3
    
    while True:
        try:
            # Test Redis connection first
            await redis_client.ping()
            consecutive_errors = 0  # Reset error count on success
            
            # Read from stream (block for 15s, then send heartbeat)
            messages = await redis_client.xread(
                {stream_key: last_id},
                count=10,
                block=15000  # 15 seconds
            )
            
            if messages:
                for stream_name, events in messages:
                    for event_id, fields in events:
                        yield {
                            "id": event_id,
                            "event": fields.get("event", "message"),
                            "data": fields.get("data", "{}")
                        }
                        last_id = event_id
            else:
                # No new events, send heartbeat
                yield {
                    "id": None,
                    "event": "comment",
                    "data": "ping"
                }
        
        except aioredis.ConnectionError as e:
            # Redis connection error
            consecutive_errors += 1
            if consecutive_errors >= max_consecutive_errors:
                yield {
                    "id": None,
                    "event": "error",
                    "data": json.dumps({"error": f"Redis connection lost: {str(e)}"})
                }
                break
            # Wait a bit before retrying
            await asyncio.sleep(1)
            yield {
                "id": None,
                "event": "comment",
                "data": f"retrying_connection_{consecutive_errors}"
            }
        
        except Exception as e:
            # Other errors
            consecutive_errors += 1
            if consecutive_errors >= max_consecutive_errors:
                yield {
                    "id": None,
                    "event": "error",
                    "data": json.dumps({"error": str(e)})
                }
                break
            # Wait before retrying
            await asyncio.sleep(1)

