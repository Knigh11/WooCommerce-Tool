"""
FBT API Client for WordPress FBT plugin endpoints.
Matching desktop app api_client.py logic exactly.
"""

import httpx
from typing import Optional, List, Dict, Tuple
from app.core.utils import retry_with_backoff_async


class FBTAPIClient:
    """
    Client for FBT REST API endpoints
    Uses WordPress Application Password Basic Auth
    Matching desktop app FBTAPIClient logic EXACTLY
    """
    
    def __init__(self, store_url: str, wp_username: str, wp_app_password: str):
        self.store_url = store_url.rstrip("/")
        self.wp_username = wp_username
        self.wp_app_password = wp_app_password
        self.base_url = f"{self.store_url}/wp-json/fbt/v1"
        self.timeout = 20.0
        self._client: Optional[httpx.AsyncClient] = None
    
    def _get_auth(self) -> Tuple[str, str]:
        """Get HTTP Basic Auth credentials"""
        return (self.wp_username, self.wp_app_password)
    
    def _get_client(self) -> httpx.AsyncClient:
        """Get or create shared httpx.AsyncClient"""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client
    
    async def aclose(self):
        """Close the shared httpx.AsyncClient"""
        if self._client is not None:
            await self._client.aclose()
            self._client = None
    
    async def _request_with_retry(
        self, 
        method: str, 
        url: str, 
        **kwargs
    ) -> Tuple[bool, Optional[Dict], Optional[int]]:
        """
        Make request with retry logic for transient errors
        Returns: (success, response_data, status_code)
        Matching desktop app retry logic EXACTLY
        """
        async def make_request():
            try:
                client = self._get_client()
                auth = self._get_auth()
                response = await client.request(
                    method, 
                    url, 
                    auth=auth,
                    headers={
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    **kwargs
                )
                status_code = response.status_code
                
                if status_code in (200, 201, 204):
                    try:
                        data = response.json() if response.content else {}
                        return True, data, status_code
                    except:
                        return True, {}, status_code
                else:
                    error_text = response.text[:500] if hasattr(response, 'text') else None
                    return False, error_text, status_code
            except httpx.RequestError as e:
                return False, str(e), None
        
        # Retry for transient errors (502, 503, 504, connection errors)
        success, result, status_code = await retry_with_backoff_async(
            make_request,
            max_retries=3,
            initial_delay=1.0,
            backoff_factor=2.0,
            retry_on_status=[502, 503, 504]
        )
        
        return success, result, status_code
    
    async def list_combos(
        self, 
        search: str = "", 
        page: int = 1, 
        per_page: int = 50
    ) -> Tuple[bool, List[Dict], Optional[str]]:
        """
        List combos with pagination and search
        Returns: (success, combos_list, error_message)
        Matching desktop app list_combos logic EXACTLY
        """
        url = f"{self.base_url}/combos"
        params = {
            "page": page,
            "per_page": per_page
        }
        if search:
            params["search"] = search
        
        success, data, status_code = await self._request_with_retry("GET", url, params=params)
        
        # Check auth errors first
        if status_code in (401, 403):
            error_snippet = data[:200] if isinstance(data, str) else str(data)[:200] if data else ""
            return False, [], f"Authentication failed (HTTP {status_code}). Check WP credentials."
        
        if not success:
            error_msg = f"Failed to list combos: HTTP {status_code}"
            if isinstance(data, str):
                error_msg += f" - {data[:200]}"
            return False, [], error_msg
        
        # Handle paginated response (matching desktop app logic)
        if isinstance(data, list):
            return True, data, None
        elif isinstance(data, dict):
            # API returns {"page": 1, "per_page": 10, "total": 1, "items": [...]}
            # Try "items" first (FBT API format), then fallback to "data" or "combos"
            combos = data.get("items") or data.get("data") or data.get("combos") or []
            return True, combos if isinstance(combos, list) else [], None
        else:
            return True, [], None
    
    async def get_combo(self, main_id: int) -> Tuple[bool, Optional[Dict], Optional[str]]:
        """
        Get combo details by main_id
        Returns: (success, combo_dict, error_message)
        Matching desktop app get_combo logic (but returns dict instead of Combo object)
        Migration happens in ops layer
        """
        url = f"{self.base_url}/combos/{main_id}"
        
        success, data, status_code = await self._request_with_retry("GET", url)
        
        # Check auth errors first
        if status_code in (401, 403):
            error_snippet = data[:200] if isinstance(data, str) else str(data)[:200] if data else ""
            return False, None, f"Authentication failed (HTTP {status_code}). Check WP credentials."
        
        if status_code == 404:
            return False, None, f"Combo with main_id {main_id} not found"
        
        if not success:
            error_msg = f"Failed to get combo {main_id}: HTTP {status_code}"
            if isinstance(data, str):
                error_msg += f" - {data[:200]}"
            return False, None, error_msg
        
        # Ensure main_id is in the data (matching desktop app logic)
        if isinstance(data, dict):
            data["main_id"] = main_id
        
        return True, data, None
    
    async def save_combo(self, combo_data: Dict) -> Tuple[bool, Optional[str]]:
        """
        Save combo (create or update)
        Tries PUT first, falls back to POST if 405/403
        Returns: (success, error_message)
        Matching desktop app save_combo logic EXACTLY
        """
        main_id = combo_data.get("main_id", 0)
        if not main_id:
            return False, "main_id is required"
        
        url = f"{self.base_url}/combos/{main_id}"
        
        # Try PUT first
        success, data, status_code = await self._request_with_retry("PUT", url, json=combo_data)
        
        # Check auth errors first
        if status_code in (401, 403):
            error_snippet = data[:200] if isinstance(data, str) else str(data)[:200] if data else ""
            return False, f"Authentication failed (HTTP {status_code}). Check WP credentials."
        
        if success and status_code in (200, 201, 204):
            return True, None
        
        # If PUT fails with 405 (Method Not Allowed) or 403, try POST
        if status_code in (405, 403):
            success, data, status_code = await self._request_with_retry("POST", url, json=combo_data)
            
            # Check auth errors for POST
            if status_code in (401, 403):
                error_snippet = data[:200] if isinstance(data, str) else str(data)[:200] if data else ""
                return False, f"Authentication failed (HTTP {status_code}). Check WP credentials."
            
            if success and status_code in (200, 201, 204):
                return True, None
        
        # Both methods failed
        error_msg = f"Failed to save combo {main_id}: HTTP {status_code}"
        if isinstance(data, str):
            error_msg += f" - {data[:200]}"
        return False, error_msg
    
    async def delete_combo(self, main_id: int) -> Tuple[bool, Optional[str]]:
        """
        Delete combo by main_id
        Returns: (success, error_message)
        Matching desktop app delete_combo logic EXACTLY
        """
        url = f"{self.base_url}/combos/{main_id}"
        
        success, data, status_code = await self._request_with_retry("DELETE", url)
        
        # Check auth errors first
        if status_code in (401, 403):
            error_snippet = data[:200] if isinstance(data, str) else str(data)[:200] if data else ""
            return False, f"Authentication failed (HTTP {status_code}). Check WP credentials."
        
        if status_code in (200, 204, 404):  # 404 = already deleted
            return True, None
        
        if not success:
            error_msg = f"Failed to delete combo {main_id}: HTTP {status_code}"
            if isinstance(data, str):
                error_msg += f" - {data[:200]}"
            return False, error_msg
        
        error_msg = f"Failed to delete combo {main_id}: HTTP {status_code}"
        if isinstance(data, str):
            error_msg += f" - {data[:200]}"
        return False, error_msg
    
    async def test_connection(self) -> Tuple[bool, str]:
        """
        Test connection to FBT API
        Returns: (success, message)
        """
        try:
            # Try to list combos with minimal params
            success, _, error = await self.list_combos(search="", page=1, per_page=1)
            if success:
                return True, "FBT API connection successful"
            else:
                return False, error or "FBT API connection failed"
        except Exception as e:
            return False, f"Connection error: {str(e)}"
