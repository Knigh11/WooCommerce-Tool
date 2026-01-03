"""
Redis-based upload session management for Description Builder.
"""

import json
import secrets
import uuid
from typing import Dict, Any, Optional, List
from datetime import datetime
import redis.asyncio as aioredis

from app.core.v2.zip_scanner import ZipLeafItem


# TTL: 24 hours
UPLOAD_SESSION_TTL = 86400


class UploadSessionStore:
    """Manage upload sessions in Redis."""
    
    def __init__(self, redis_client: aioredis.Redis):
        """
        Initialize upload session store.
        
        Args:
            redis_client: Redis async client
        """
        self.redis = redis_client
    
    def _session_key(self, store_id: str, upload_id: str) -> str:
        """Get Redis key for upload session."""
        return f"desc:upload:{store_id}:{upload_id}"
    
    async def create_session(
        self,
        store_id: str,
        zip_path: str,
        root_name: Optional[str],
        multiple_roots: bool,
        zip_size: int,
        items: List[ZipLeafItem]
    ) -> tuple[str, str]:
        """
        Create a new upload session.
        
        Args:
            store_id: Store ID
            zip_path: Path to uploaded ZIP file
            root_name: Root folder name (if single root)
            multiple_roots: Whether ZIP has multiple root folders
            zip_size: ZIP file size in bytes
            items: List of ZipLeafItem objects
        
        Returns:
            Tuple of (upload_id, upload_token)
        """
        upload_id = str(uuid.uuid4())
        upload_token = self._generate_token()
        
        # Convert ZipLeafItem objects to dicts for JSON serialization
        # Ensure all values are JSON-serializable (boolean is OK in JSON, but we'll store as string in Redis)
        items_data = [
            {
                "id": str(item.id),  # Ensure string
                "rel_path": str(item.rel_path),
                "title": str(item.title),
                "category": str(item.category),
                "has_description": bool(item.has_description)  # Keep as boolean for JSON
            }
            for item in items
        ]
        
        # All values in session_data must be strings for Redis hash
        session_data = {
            "store_id": str(store_id),
            "upload_id": str(upload_id),
            "upload_token": str(upload_token),
            "zip_path": str(zip_path),
            "root_name": str(root_name) if root_name else "",
            "multiple_roots": str(multiple_roots).lower(),  # Convert boolean to string
            "zip_size": str(zip_size),  # Convert int to string
            "items": json.dumps(items_data),  # Store as JSON string (boolean in JSON is OK)
            "created_at": str(datetime.utcnow().isoformat())
        }
        
        key = self._session_key(store_id, upload_id)
        await self.redis.hset(key, mapping=session_data)
        await self.redis.expire(key, UPLOAD_SESSION_TTL)
        
        return upload_id, upload_token
    
    async def get_session(
        self,
        store_id: str,
        upload_id: str,
        upload_token: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get upload session.
        
        Args:
            store_id: Store ID
            upload_id: Upload ID
            upload_token: Optional token for verification
        
        Returns:
            Session dict or None if not found
        
        Raises:
            HTTPException: If token doesn't match
        """
        from fastapi import HTTPException, status
        
        key = self._session_key(store_id, upload_id)
        session_raw = await self.redis.hgetall(key)
        
        if not session_raw:
            return None
        
        # Decode bytes to strings
        session = {}
        for k, v in session_raw.items():
            key_str = k.decode() if isinstance(k, bytes) else k
            value_str = v.decode() if isinstance(v, bytes) else v
            session[key_str] = value_str
        
        # Verify token if provided
        if upload_token:
            stored_token = session.get("upload_token")
            if not stored_token or not secrets.compare_digest(upload_token, stored_token):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Invalid upload token"
                )
        
        # Verify store_id matches
        if session.get("store_id") != store_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Upload session does not belong to this store"
            )
        
        # Convert string values back to proper types
        if "multiple_roots" in session:
            session["multiple_roots"] = session["multiple_roots"].lower() == "true"
        if "zip_size" in session:
            try:
                session["zip_size"] = int(session["zip_size"])
            except (ValueError, TypeError):
                session["zip_size"] = 0
        if "root_name" in session and session["root_name"] == "":
            session["root_name"] = None
        
        # Parse items JSON
        if "items" in session:
            try:
                items_data = json.loads(session["items"])
                # Reconstruct ZipLeafItem objects
                from app.core.v2.zip_scanner import ZipLeafItem
                session["items"] = [
                    ZipLeafItem(
                        id=item["id"],
                        rel_path=item["rel_path"],
                        title=item["title"],
                        category=item["category"],
                        has_description=bool(item.get("has_description", False))  # Convert to boolean
                    )
                    for item in items_data
                ]
            except:
                session["items"] = []
        
        return session
    
    async def delete_session(self, store_id: str, upload_id: str) -> bool:
        """
        Delete upload session.
        
        Args:
            store_id: Store ID
            upload_id: Upload ID
        
        Returns:
            True if deleted, False if not found
        """
        key = self._session_key(store_id, upload_id)
        deleted = await self.redis.delete(key)
        return deleted > 0
    
    def _generate_token(self) -> str:
        """Generate secure random token."""
        return secrets.token_hex(32)

