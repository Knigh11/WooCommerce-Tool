"""
WordPress API Client for media deletion and uploads.
Async version adapted from desktop app.
"""

import asyncio
import time
from typing import Optional, Tuple, Dict
import httpx
from urllib.parse import urljoin


class WPClient:
    """
    Async client for WordPress REST API (media operations).
    """
    
    def __init__(
        self,
        store_url: str,
        username: str,
        app_password: str,
        timeout: float = 30.0
    ):
        """
        Initialize WordPress client.
        
        Args:
            store_url: Store base URL
            username: WordPress username
            app_password: WordPress application password
            timeout: Request timeout in seconds
        """
        self.store_url = store_url.rstrip("/")
        self.base = f"{self.store_url}/wp-json/wp/v2"
        self.username = username
        self.app_password = app_password
        self.timeout = timeout
        
        # Create HTTP client
        self.client = httpx.AsyncClient(
            timeout=timeout,
            follow_redirects=True,
            auth=httpx.BasicAuth(username, app_password),
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
        )
    
    async def test_connection(self) -> Tuple[bool, str]:
        """
        Test WordPress API connection.
        
        Returns:
            (success, message)
        """
        try:
            url = f"{self.base}/users/me"
            r = await self.client.get(url)
            
            if r.status_code == 200:
                return True, "Kết nối WordPress thành công!"
            elif r.status_code in (401, 403):
                return False, "Lỗi xác thực: Username hoặc Application Password không đúng"
            else:
                return False, f"Lỗi kết nối WordPress: {r.status_code}"
        except httpx.RequestError as e:
            return False, f"Lỗi kết nối WordPress: {str(e)}"
    
    async def delete_media(
        self,
        media_id: int,
        retries: int = 2,
        backoff_seconds: float = 1.0,
        force: bool = True
    ) -> Tuple[bool, str]:
        """
        Delete a media file (force delete) with retry logic.
        
        Args:
            media_id: Media ID to delete
            retries: Number of retries for server errors
            backoff_seconds: Backoff delay between retries
            force: Force delete (default: True)
        
        Returns:
            (success, message)
            - success=True: Deleted successfully or media doesn't exist (404/410)
            - success=False: Real error (401, 403, or exhausted retries)
        """
        url = f"{self.base}/media/{media_id}"
        params = {"force": "true" if force else "false"}
        
        last_error = None
        
        for attempt in range(retries + 1):
            start = time.time()
            try:
                r = await self.client.delete(url, params=params)
                elapsed = time.time() - start
                status = r.status_code
                
                # 200, 204 = deleted successfully
                if status in (200, 204):
                    return True, f"Đã xóa media {media_id}"
                
                # 404, 410 = media doesn't exist or already deleted
                # Treat as success because goal (media doesn't exist) is achieved
                if status in (404, 410):
                    return True, f"Media {media_id} không tồn tại / đã bị xóa trước đó"
                
                # 500, 502, 503, 504, 429 = server errors or rate limit
                # Only retry for these
                if status in (500, 502, 503, 504, 429):
                    last_error = f"HTTP {status}"
                    if attempt < retries:
                        await asyncio.sleep(backoff_seconds * (attempt + 1))
                        continue
                else:
                    # Other errors (400, 401, 403, 422, etc.) - DON'T retry
                    error_msg = r.text[:200] if hasattr(r, 'text') else ""
                    return False, f"Lỗi khi xóa media {media_id}: {status} - {error_msg}"
                    
            except httpx.TimeoutException as e:
                elapsed = time.time() - start
                last_error = f"Timeout: {str(e)}"
                if attempt < retries:
                    await asyncio.sleep(backoff_seconds * (attempt + 1))
                    continue
                    
            except httpx.RequestError as e:
                elapsed = time.time() - start
                last_error = f"Lỗi kết nối: {str(e)}"
                if attempt < retries:
                    await asyncio.sleep(backoff_seconds * (attempt + 1))
                    continue
        
        # Exhausted retries for server errors
        return False, f"Không thể xóa media {media_id} sau {retries + 1} lần thử: {last_error}"
    
    async def upload_media(self, file_path: str) -> Optional[Dict]:
        """
        Upload a media file to WordPress.
        
        Args:
            file_path: Path to local file to upload
        
        Returns:
            Dict with keys: {"id": int, "src": str, "alt": str}, or None on failure
        """
        import os
        from pathlib import Path
        
        if not os.path.exists(file_path):
            return None
        
        url = f"{self.base}/media"
        file_name = os.path.basename(file_path)
        
        try:
            # Read file
            with open(file_path, 'rb') as f:
                file_content = f.read()
            
            # Determine content type
            content_type = self._get_content_type(file_path)
            
            # Upload file
            files = {'file': (file_name, file_content, content_type)}
            headers = {
                'Content-Disposition': f'attachment; filename={file_name}'
            }
            
            # Remove Content-Type from default headers for multipart upload
            async with httpx.AsyncClient(
                timeout=120.0,
                follow_redirects=True,
                auth=httpx.BasicAuth(self.username, self.app_password)
            ) as upload_client:
                r = await upload_client.post(url, files=files, headers=headers)
            
            if r.status_code in (200, 201):
                data = r.json()
                return {
                    "id": data.get("id"),
                    "src": data.get("source_url", ""),
                    "alt": data.get("alt_text", "")
                }
            else:
                return None
        except Exception as e:
            return None
    
    def _get_content_type(self, file_path: str) -> str:
        """Guess content type from file extension."""
        from pathlib import Path
        ext = Path(file_path).suffix.lower()
        content_types = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
        }
        return content_types.get(ext, 'application/octet-stream')
    
    async def close(self):
        """Close HTTP client."""
        await self.client.aclose()

