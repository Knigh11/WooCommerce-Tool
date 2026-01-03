"""
Rate limiting and concurrency guards for Description Builder.
"""

import redis.asyncio as aioredis
from fastapi import HTTPException, status


# Limits
MAX_CONCURRENT_UPLOADS = 3
MAX_CONCURRENT_JOBS = 2


class RateLimiter:
    """Rate limiting using Redis counters."""
    
    def __init__(self, redis_client: aioredis.Redis):
        """
        Initialize rate limiter.
        
        Args:
            redis_client: Redis async client
        """
        self.redis = redis_client
    
    def _upload_counter_key(self, store_id: str) -> str:
        """Get Redis key for upload counter."""
        return f"desc:active_uploads:{store_id}"
    
    def _job_counter_key(self, store_id: str) -> str:
        """Get Redis key for job counter."""
        return f"desc:active_jobs:{store_id}"
    
    async def acquire_upload_slot(self, store_id: str) -> bool:
        """
        Try to acquire an upload slot.
        
        Args:
            store_id: Store ID
        
        Returns:
            True if slot acquired, False if limit reached
        
        Raises:
            HTTPException: If limit reached
        """
        key = self._upload_counter_key(store_id)
        
        # Get current count
        current = await self.redis.get(key)
        current_count = int(current) if current else 0
        
        if current_count >= MAX_CONCURRENT_UPLOADS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Maximum {MAX_CONCURRENT_UPLOADS} concurrent uploads per store. Please wait for existing uploads to complete."
            )
        
        # Increment atomically
        new_count = await self.redis.incr(key)
        await self.redis.expire(key, 86400)  # TTL 24h
        
        if new_count > MAX_CONCURRENT_UPLOADS:
            # Rollback
            await self.redis.decr(key)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Maximum {MAX_CONCURRENT_UPLOADS} concurrent uploads per store. Please wait for existing uploads to complete."
            )
        
        return True
    
    async def release_upload_slot(self, store_id: str) -> None:
        """
        Release an upload slot.
        
        Args:
            store_id: Store ID
        """
        key = self._upload_counter_key(store_id)
        current = await self.redis.get(key)
        if current and int(current) > 0:
            await self.redis.decr(key)
    
    async def acquire_job_slot(self, store_id: str) -> bool:
        """
        Try to acquire a job slot.
        
        Args:
            store_id: Store ID
        
        Returns:
            True if slot acquired, False if limit reached
        
        Raises:
            HTTPException: If limit reached
        """
        key = self._job_counter_key(store_id)
        
        # Get current count
        current = await self.redis.get(key)
        current_count = int(current) if current else 0
        
        if current_count >= MAX_CONCURRENT_JOBS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Maximum {MAX_CONCURRENT_JOBS} concurrent generation jobs per store. Please wait for existing jobs to complete."
            )
        
        # Increment atomically
        new_count = await self.redis.incr(key)
        await self.redis.expire(key, 86400)  # TTL 24h
        
        if new_count > MAX_CONCURRENT_JOBS:
            # Rollback
            await self.redis.decr(key)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Maximum {MAX_CONCURRENT_JOBS} concurrent generation jobs per store. Please wait for existing jobs to complete."
            )
        
        return True
    
    async def release_job_slot(self, store_id: str) -> None:
        """
        Release a job slot.
        
        Args:
            store_id: Store ID
        """
        key = self._job_counter_key(store_id)
        current = await self.redis.get(key)
        if current and int(current) > 0:
            await self.redis.decr(key)

