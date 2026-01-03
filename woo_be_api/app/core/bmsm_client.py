"""
BMSM Index API Client for WordPress BMSM plugin endpoints.
Matching desktop app index_client.py logic.
"""

import httpx
from typing import Optional, List, Dict, Tuple
from app.core.utils import retry_with_backoff_async


class BmsmIndexClient:
    """
    Client for BMSM custom REST API endpoint (/wp-json/bmsm/v1/index)
    Uses WordPress Application Password Basic Auth
    Matching desktop app BmsmIndexClient logic
    """
    
    def __init__(self, store_url: str, wp_username: str, wp_app_password: str):
        self.store_url = store_url.rstrip("/")
        self.wp_username = wp_username
        self.wp_app_password = wp_app_password
        self.base_url = f"{self.store_url}/wp-json/bmsm/v1"
        self.timeout = 30.0
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
        Matching desktop app retry logic
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
    
    async def get_index(
        self, 
        page: int = 1, 
        per_page: int = 50, 
        search: str = "", 
        filter_type: str = "all"
    ) -> Tuple[bool, List[Dict], int, Optional[str]]:
        """
        Get BMSM index (products with BMSM configured)
        
        Args:
            page: Page number
            per_page: Items per page (max 100)
            search: Search query (product name or ID)
            filter_type: Filter type (all, enabled, disabled_with_rules, invalid, with_rules, no_rules)
            
        Returns:
            (success, items_list, total_count, error_message)
        Matching desktop app get_index logic
        """
        url = f"{self.base_url}/index"
        params = {
            "page": page,
            "per_page": min(per_page, 100),  # Cap at 100
            "filter": filter_type
        }
        
        if search:
            params["search"] = search
        
        success, data, status_code = await self._request_with_retry("GET", url, params=params)
        
        # Check auth errors first
        if status_code in (401, 403):
            error_snippet = data[:200] if isinstance(data, str) else str(data)[:200] if data else ""
            return False, [], 0, f"Unauthorized/Forbidden (HTTP {status_code}): check WP Application Password and permissions. URL: {url}. Response: {error_snippet}"
        
        if not success:
            error_msg = f"Failed to get BMSM index: HTTP {status_code}"
            if isinstance(data, str):
                error_msg += f" - {data[:200]}"
            return False, [], 0, error_msg
        
        if isinstance(data, dict):
            items = data.get("items", [])
            total = data.get("total", len(items))
            return True, items, total, None
        else:
            return False, [], 0, "Invalid response format"
    
    async def test_connection(self) -> Tuple[bool, str]:
        """
        Test connection to BMSM index API
        Returns: (success, message)
        """
        try:
            # Try to get index with minimal params
            success, _, _, error = await self.get_index(page=1, per_page=1, search="", filter_type="all")
            if success:
                return True, "BMSM Index API connection successful"
            else:
                return False, error or "BMSM Index API connection failed"
        except Exception as e:
            return False, f"Connection error: {str(e)}"

