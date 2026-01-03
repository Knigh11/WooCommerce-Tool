"""
Cleanup task for expired upload sessions and jobs.
"""

import os
import asyncio
import logging
import tempfile
from pathlib import Path
import redis.asyncio as aioredis

from app.deps import get_redis

logger = logging.getLogger(__name__)


async def cleanup_expired_sessions_and_jobs(redis: aioredis.Redis, data_dir: Path):
    """
    Clean up expired upload sessions and jobs.
    
    This function:
    1. Scans Redis for expired upload session keys
    2. Deletes associated ZIP files
    3. Scans Redis for expired job keys
    4. Deletes associated patch ZIP files and event streams
    
    Args:
        redis: Redis client
        data_dir: Base data directory for files
    """
    try:
        # Cleanup upload sessions
        await _cleanup_upload_sessions(redis, data_dir)
        
        # Cleanup jobs
        await _cleanup_jobs(redis, data_dir)
        
    except Exception as e:
        logger.error(f"Error in cleanup task: {str(e)}", exc_info=True)


async def _cleanup_upload_sessions(redis: aioredis.Redis, data_dir: Path):
    """Clean up expired upload sessions."""
    try:
        # Test connection first
        await redis.ping()
    except Exception as e:
        logger.warning(f"Redis connection failed in cleanup_upload_sessions: {str(e)}")
        return
    
    try:
        # Scan for upload session keys
        pattern = "desc:upload:*"
        cursor = 0
        deleted_count = 0
        
        while True:
            try:
                cursor, keys = await redis.scan(cursor, match=pattern, count=100)
            except Exception as e:
                logger.warning(f"Redis scan error: {str(e)}")
                break
            
            for key in keys:
                # Check if key exists (hasn't expired yet)
                exists = await redis.exists(key)
                if not exists:
                    # Key expired, try to extract store_id and upload_id from key
                    # Key format: desc:upload:{store_id}:{upload_id}
                    parts = key.split(":")
                    if len(parts) >= 4:
                        store_id = parts[2]
                        upload_id = parts[3]
                        
                        # Try to delete associated ZIP file
                        upload_dir = data_dir / store_id / upload_id
                        zip_file = upload_dir / "input.zip"
                        if zip_file.exists():
                            try:
                                zip_file.unlink()
                                # Try to remove directory if empty
                                try:
                                    upload_dir.rmdir()
                                except:
                                    pass  # Directory not empty or doesn't exist
                                deleted_count += 1
                            except Exception as e:
                                logger.warning(f"Failed to delete ZIP file {zip_file}: {str(e)}")
            
            if cursor == 0:
                break
        
        if deleted_count > 0:
            logger.info(f"Cleaned up {deleted_count} expired upload session files")
            
    except Exception as e:
        logger.error(f"Error cleaning up upload sessions: {str(e)}", exc_info=True)


async def _cleanup_jobs(redis: aioredis.Redis, data_dir: Path):
    """Clean up expired jobs."""
    try:
        # Test connection first
        await redis.ping()
    except Exception as e:
        logger.warning(f"Redis connection failed in cleanup_jobs: {str(e)}")
        return
    
    try:
        # Scan for job state keys
        pattern = "job:*:state"
        cursor = 0
        deleted_count = 0
        
        while True:
            try:
                cursor, keys = await redis.scan(cursor, match=pattern, count=100)
            except Exception as e:
                logger.warning(f"Redis scan error: {str(e)}")
                break
            
            for key in keys:
                # Check if key exists (hasn't expired yet)
                exists = await redis.exists(key)
                if not exists:
                    # Key expired, extract job_id
                    # Key format: job:{job_id}:state
                    parts = key.split(":")
                    if len(parts) >= 3:
                        job_id = parts[1]
                        
                        # Try to delete associated patch ZIP file
                        # Need to find which store this job belongs to
                        # We'll scan store directories
                        for store_dir in data_dir.iterdir():
                            if store_dir.is_dir():
                                job_dir = store_dir / job_id
                                patch_file = job_dir / "patch.zip"
                                if patch_file.exists():
                                    try:
                                        patch_file.unlink()
                                        # Try to remove directory if empty
                                        try:
                                            job_dir.rmdir()
                                        except:
                                            pass
                                        deleted_count += 1
                                    except Exception as e:
                                        logger.warning(f"Failed to delete patch file {patch_file}: {str(e)}")
                        
                        # Delete event stream if it exists
                        stream_key = f"job:{job_id}:events"
                        try:
                            await redis.delete(stream_key)
                        except:
                            pass
            
            if cursor == 0:
                break
        
        if deleted_count > 0:
            logger.info(f"Cleaned up {deleted_count} expired job files")
            
    except Exception as e:
        logger.error(f"Error cleaning up jobs: {str(e)}", exc_info=True)


async def run_cleanup_task(interval_seconds: int = 3600):
    """
    Run cleanup task periodically.
    
    Args:
        interval_seconds: Interval between cleanup runs (default: 1 hour)
    """
    logger.info(f"Starting cleanup task (interval: {interval_seconds}s)")
    
    data_dir = Path(os.getenv("DATA_DIR", tempfile.gettempdir())) / "desc_builder"
    data_dir.mkdir(parents=True, exist_ok=True)
    
    # Wait a bit before first run to ensure Redis is ready
    await asyncio.sleep(10)
    
    while True:
        try:
            redis = await get_redis()
            # Test connection first
            try:
                await redis.ping()
            except Exception as ping_error:
                logger.warning(f"Redis not available for cleanup: {str(ping_error)}")
                await asyncio.sleep(interval_seconds)
                continue
            
            await cleanup_expired_sessions_and_jobs(redis, data_dir)
        except asyncio.CancelledError:
            logger.info("Cleanup task cancelled")
            raise
        except Exception as e:
            logger.error(f"Error in cleanup task loop: {str(e)}", exc_info=True)
            # Don't spam errors, wait before retrying
            await asyncio.sleep(60)  # Wait 1 minute before retrying on error
        
        await asyncio.sleep(interval_seconds)

