"""
WooCommerce REST API client with retry logic and rate limiting.
"""

import time
import random
import asyncio
from typing import Optional, Dict, List, Any, Tuple
import httpx
from urllib.parse import urljoin

from app.core.security import sanitize_dict_for_logging


class WooCommerceError(Exception):
    """Base exception for WooCommerce API errors."""
    pass


class WooClient:
    """
    Async WooCommerce REST API client.
    
    Supports:
    - WooCommerce API v3 (consumer_key/consumer_secret)
    - WordPress REST API (wp_username/wp_app_password)
    """
    
    def __init__(
        self,
        store_url: str,
        consumer_key: Optional[str] = None,
        consumer_secret: Optional[str] = None,
        wp_username: Optional[str] = None,
        wp_app_password: Optional[str] = None,
        rate_limit_rps: float = 5.0,
        timeout: float = 30.0
    ):
        """
        Initialize WooCommerce client.
        
        Args:
            store_url: Store base URL (e.g., https://example.com)
            consumer_key: WooCommerce consumer key
            consumer_secret: WooCommerce consumer secret
            wp_username: WordPress username (fallback)
            wp_app_password: WordPress application password (fallback)
            rate_limit_rps: Rate limit (requests per second)
            timeout: Request timeout in seconds
        """
        self.store_url = store_url.rstrip('/')
        self.consumer_key = consumer_key
        self.consumer_secret = consumer_secret
        self.wp_username = wp_username
        self.wp_app_password = wp_app_password
        self.rate_limit_rps = rate_limit_rps
        self.timeout = timeout
        
        # Rate limiting state
        self._last_request_time = 0.0
        self._min_interval = 1.0 / rate_limit_rps if rate_limit_rps > 0 else 0
        
        # Determine auth method
        if consumer_key and consumer_secret:
            self.auth_method = "woocommerce"
        elif wp_username and wp_app_password:
            self.auth_method = "wordpress"
        else:
            raise ValueError("Must provide either (consumer_key, consumer_secret) or (wp_username, wp_app_password)")
        
        # Create HTTP client
        self.client = httpx.AsyncClient(
            timeout=timeout,
            follow_redirects=True
        )
    
    def _get_auth(self) -> httpx.Auth:
        """Get authentication for requests."""
        if self.auth_method == "woocommerce":
            return httpx.BasicAuth(self.consumer_key, self.consumer_secret)
        else:
            # WordPress application password
            return httpx.BasicAuth(self.wp_username, self.wp_app_password)
    
    async def _wait_for_rate_limit(self):
        """Wait if needed to respect rate limit."""
        now = time.time()
        elapsed = now - self._last_request_time
        if elapsed < self._min_interval:
            wait_time = self._min_interval - elapsed
            await asyncio.sleep(wait_time)
        self._last_request_time = time.time()
    
    async def _request(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict] = None,
        json_data: Optional[Dict] = None,
        max_retries: int = 5,
        initial_delay: float = 2.0,
        backoff_factor: float = 2.0
    ) -> httpx.Response:
        """
        Make HTTP request with retry logic.
        
        Args:
            method: HTTP method
            endpoint: API endpoint (relative to store_url)
            params: Query parameters
            json_data: JSON body
            max_retries: Maximum retry attempts
            initial_delay: Initial retry delay in seconds
            backoff_factor: Backoff multiplier
        
        Returns:
            httpx.Response
        
        Raises:
            WooCommerceError: If request fails after retries
        """
        url = urljoin(self.store_url + '/', endpoint.lstrip('/'))
        auth = self._get_auth()
        
        last_error = None
        
        for attempt in range(max_retries + 1):
            # Rate limiting
            await self._wait_for_rate_limit()
            
            try:
                response = await self.client.request(
                    method=method,
                    url=url,
                    params=params,
                    json=json_data,
                    auth=auth
                )
                
                # Success
                if response.status_code in (200, 201, 204):
                    return response
                
                # Non-retryable errors
                if response.status_code in (400, 401, 403, 404, 422):
                    raise WooCommerceError(
                        f"HTTP {response.status_code}: {response.text[:200]}"
                    )
                
                # Retryable errors (429, 500, 502, 503, 504)
                if response.status_code in (429, 500, 502, 503, 504):
                    last_error = f"HTTP {response.status_code}"
                    if attempt < max_retries:
                        delay = min(
                            initial_delay * (backoff_factor ** attempt),
                            60.0  # Max 60s delay
                        )
                        delay += random.uniform(0, 0.4)  # Jitter
                        await asyncio.sleep(delay)
                        continue
                    else:
                        raise WooCommerceError(
                            f"HTTP {response.status_code} after {max_retries} retries: {response.text[:200]}"
                        )
                
                # Other status codes
                response.raise_for_status()
                return response
                
            except httpx.TimeoutException as e:
                last_error = f"Timeout: {str(e)}"
                if attempt < max_retries:
                    delay = min(
                        initial_delay * (backoff_factor ** attempt),
                        60.0
                    )
                    await asyncio.sleep(delay)
                    continue
                else:
                    raise WooCommerceError(f"Timeout after {max_retries} retries: {e}")
            
            except httpx.RequestError as e:
                last_error = f"Request error: {str(e)}"
                if attempt < max_retries:
                    delay = min(
                        initial_delay * (backoff_factor ** attempt),
                        60.0
                    )
                    await asyncio.sleep(delay)
                    continue
                else:
                    raise WooCommerceError(f"Request error after {max_retries} retries: {e}")
        
        # Should not reach here
        raise WooCommerceError(f"Request failed after {max_retries} retries: {last_error}")
    
    async def get_products(
        self,
        page: int = 1,
        per_page: int = 50,
        search: Optional[str] = None,
        include: Optional[List[int]] = None
    ) -> Dict[str, Any]:
        """
        List products.
        
        Args:
            page: Page number
            per_page: Items per page
            search: Search query
            include: List of product IDs to include
        
        Returns:
            Dict with 'items' list and pagination info
        """
        params = {
            "page": page,
            "per_page": per_page
        }
        if search:
            params["search"] = search
        if include:
            params["include"] = ",".join(map(str, include))
        
        response = await self._request("GET", "/wp-json/wc/v3/products", params=params)
        products = response.json()
        
        # Extract pagination from headers
        total = int(response.headers.get("X-WP-Total", 0))
        total_pages = int(response.headers.get("X-WP-TotalPages", 1))
        
        return {
            "items": products if isinstance(products, list) else [],
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": total_pages
        }
    
    async def get_product(self, product_id: int) -> Dict[str, Any]:
        """
        Get product by ID.
        
        Args:
            product_id: Product ID
        
        Returns:
            Product dict
        """
        response = await self._request("GET", f"/wp-json/wc/v3/products/{product_id}")
        return response.json()
    
    async def delete_product(self, product_id: int, force: bool = True) -> bool:
        """
        Delete product.
        
        Args:
            product_id: Product ID
            force: Force delete (skip trash)
        
        Returns:
            True if successful
        """
        params = {"force": "true"} if force else {}
        response = await self._request("DELETE", f"/wp-json/wc/v3/products/{product_id}", params=params)
        return response.status_code in (200, 201, 204)
    
    async def update_product(self, product_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update product fields.
        
        Args:
            product_id: Product ID
            data: Update data (partial)
        
        Returns:
            Updated product dict
        """
        response = await self._request("PATCH", f"/wp-json/wc/v3/products/{product_id}", json_data=data)
        return response.json()
    
    async def batch_update_products(self, updates: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Batch update products.
        
        Args:
            updates: List of product update dicts (must include 'id')
        
        Returns:
            Batch result dict
        """
        payload = {"update": updates}
        response = await self._request("POST", "/wp-json/wc/v3/products/batch", json_data=payload)
        return response.json()
    
    async def get_variations(self, product_id: int, page: int = 1, per_page: int = 50) -> Dict[str, Any]:
        """
        Get product variations.
        
        Args:
            product_id: Parent product ID
            page: Page number
            per_page: Items per page
        
        Returns:
            Dict with variations list and pagination
        """
        params = {
            "page": page,
            "per_page": per_page
        }
        response = await self._request("GET", f"/wp-json/wc/v3/products/{product_id}/variations", params=params)
        variations = response.json()
        
        total = int(response.headers.get("X-WP-Total", 0))
        total_pages = int(response.headers.get("X-WP-TotalPages", 1))
        
        return {
            "items": variations if isinstance(variations, list) else [],
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": total_pages
        }
    
    async def test_connection(self) -> Tuple[bool, str]:
        """
        Test WooCommerce API connection.
        
        Returns:
            (success, message)
        """
        try:
            response = await self._request("GET", "/wp-json/wc/v3/system_status")
            return True, "Kết nối thành công!"
        except WooCommerceError as e:
            error_str = str(e)
            if "401" in error_str:
                return False, "Lỗi xác thực: Consumer Key hoặc Consumer Secret không đúng"
            elif "404" in error_str:
                return False, "Không tìm thấy API endpoint. Kiểm tra lại store_url"
            else:
                return False, f"Lỗi kết nối: {error_str[:200]}"
        except Exception as e:
            error_str = str(e)
            if "NameResolutionError" in error_str or "getaddrinfo failed" in error_str:
                domain = self.store_url.replace("http://", "").replace("https://", "").split("/")[0]
                return False, f"Không thể kết nối đến {domain}.\n\nNguyên nhân có thể:\n- Kiểm tra kết nối internet\n- Kiểm tra lại URL store\n- Domain có thể tạm thời không khả dụng"
            elif "timeout" in error_str.lower():
                return False, f"Kết nối timeout.\n\nNguyên nhân có thể:\n- Server phản hồi chậm\n- Vấn đề kết nối mạng"
            else:
                return False, f"Lỗi kết nối: {error_str[:200]}"
    
    async def get_all_categories(self) -> List[Dict]:
        """
        Get all categories with pagination.
        
        Returns:
            List of category dicts
        """
        all_categories = []
        page = 1
        per_page = 100
        
        while True:
            params = {
                "per_page": per_page,
                "page": page
            }
            
            try:
                response = await self._request("GET", "/wp-json/wc/v3/products/categories", params=params)
                items = response.json()
                
                if not items:
                    break
                
                all_categories.extend(items)
                
                if len(items) < per_page:
                    break
                page += 1
            except Exception:
                break
        
        return all_categories
    
    async def create_category(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a category."""
        response = await self._request("POST", "/wp-json/wc/v3/products/categories", json_data=data)
        return response.json()
    
    async def update_category(self, category_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
        """Update a category."""
        response = await self._request("PUT", f"/wp-json/wc/v3/products/categories/{category_id}", json_data=data)
        return response.json()
    
    async def delete_category(self, category_id: int, force: bool = True) -> bool:
        """Delete a category."""
        params = {"force": "true"} if force else {}
        response = await self._request("DELETE", f"/wp-json/wc/v3/products/categories/{category_id}", params=params)
        return response.status_code in (200, 201, 204)
    
    async def create_review(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a product review."""
        response = await self._request("POST", "/wp-json/wc/v3/products/reviews", json_data=data)
        return response.json()
    
    async def fetch_products_by_category(self, category_id: int, status: str = "any") -> List[int]:
        """
        Get all product IDs in a category with pagination.
        
        Args:
            category_id: Category ID
            status: Product status (default: "any" to get all)
        
        Returns:
            List of product IDs
        """
        all_ids = []
        page = 1
        per_page = 100
        
        while True:
            params = {
                "category": category_id,
                "per_page": per_page,
                "page": page,
                "status": status
            }
            
            try:
                response = await self._request("GET", "/wp-json/wc/v3/products", params=params)
                items = response.json()
                
                if not items:
                    break
                
                ids = [p["id"] for p in items]
                all_ids.extend(ids)
                
                if len(items) < per_page:
                    break
                page += 1
            except Exception:
                break
        
        return all_ids
    
    async def fetch_products_with_details_by_category(self, category_id: int, status: str = "any") -> List[Dict]:
        """
        Get all products with details (id, name, type, regular_price, sale_price) in a category.
        Optimized: only 1 request per page instead of n individual requests.
        
        Args:
            category_id: Category ID
            status: Product status (default: "any")
        
        Returns:
            List of product dicts with selected fields
        """
        all_products = []
        page = 1
        per_page = 100
        
        while True:
            params = {
                "category": category_id,
                "per_page": per_page,
                "page": page,
                "status": status
            }
            
            try:
                response = await self._request("GET", "/wp-json/wc/v3/products", params=params)
                items = response.json()
                
                if not items:
                    break
                
                # Extract only needed fields
                products = []
                for item in items:
                    products.append({
                        "id": item.get("id"),
                        "name": item.get("name", f"Product #{item.get('id')}"),
                        "type": item.get("type", "simple"),
                        "regular_price": item.get("regular_price"),
                        "sale_price": item.get("sale_price")
                    })
                
                all_products.extend(products)
                
                if len(items) < per_page:
                    break
                page += 1
            except Exception:
                break
        
        return all_products
    
    async def get_product_variations(self, product_id: int) -> List[Dict]:
        """
        Get all variations of a variable product.
        
        Args:
            product_id: Parent product ID
        
        Returns:
            List of variation dicts
        """
        all_variations = []
        page = 1
        per_page = 100
        
        while True:
            params = {
                "per_page": per_page,
                "page": page
            }
            
            try:
                response = await self._request("GET", f"/wp-json/wc/v3/products/{product_id}/variations", params=params)
                items = response.json()
                
                if not items:
                    break
                
                all_variations.extend(items)
                
                if len(items) < per_page:
                    break
                page += 1
            except Exception:
                break
        
        return all_variations
    
    async def update_product_price(
        self,
        product_id: int,
        regular_price: Optional[str] = None,
        sale_price: Optional[str] = None
    ) -> bool:
        """
        Update product price - only send new prices via PATCH.
        Only sends regular_price and sale_price, no other fields.
        
        Args:
            product_id: Product ID
            regular_price: New regular price (string)
            sale_price: New sale price (string)
        
        Returns:
            True if successful
        """
        data = {}
        
        if regular_price is not None and regular_price != "":
            data["regular_price"] = str(regular_price)
        
        if sale_price is not None and sale_price != "":
            data["sale_price"] = str(sale_price)
        
        if not data:
            return False
        
        try:
            response = await self._request("PATCH", f"/wp-json/wc/v3/products/{product_id}", json_data=data)
            return response.status_code == 200
        except Exception:
            return False
    
    async def update_variation_price(
        self,
        product_id: int,
        variation_id: int,
        regular_price: Optional[str] = None,
        sale_price: Optional[str] = None
    ) -> bool:
        """
        Update variation price - only send new prices via PATCH.
        
        Args:
            product_id: Parent product ID
            variation_id: Variation ID
            regular_price: New regular price (string)
            sale_price: New sale price (string)
        
        Returns:
            True if successful
        """
        data = {}
        
        if regular_price is not None and regular_price != "":
            data["regular_price"] = str(regular_price)
        
        if sale_price is not None and sale_price != "":
            data["sale_price"] = str(sale_price)
        
        if not data:
            return False
        
        try:
            response = await self._request("PATCH", f"/wp-json/wc/v3/products/{product_id}/variations/{variation_id}", json_data=data)
            return response.status_code == 200
        except Exception:
            return False
    
    async def batch_update_variations(
        self,
        product_id: int,
        updates: List[Dict],
        delay_between_batches: float = 0.2
    ) -> Tuple[Dict, List[Dict]]:
        """
        Batch update variations with retry logic.
        
        Args:
            product_id: Parent product ID
            updates: List of variation update dicts (must include 'id')
            delay_between_batches: Delay between batches in seconds
        
        Returns:
            (results_dict, failed_items)
            results_dict: {"update": List[Dict]} - successfully updated variations
            failed_items: List[Dict] - failed items after retries
        """
        from app.core.utils import retry_with_backoff_async
        
        batch_limit = 70
        all_results = {"update": []}
        failed_items = []
        total_batches = (len(updates) + batch_limit - 1) // batch_limit
        
        for i in range(0, len(updates), batch_limit):
            batch = updates[i:i + batch_limit]
            batch_num = i // batch_limit + 1
            payload = {"update": batch}
            
            async def make_request():
                try:
                    response = await self._request("POST", f"/wp-json/wc/v3/products/{product_id}/variations/batch", json_data=payload)
                    if response.status_code == 200:
                        return True, response.json(), response.status_code
                    else:
                        return False, response.text[:500], response.status_code
                except Exception as e:
                    return False, str(e), None
            
            success, result, status_code = await retry_with_backoff_async(
                make_request,
                max_retries=4,
                initial_delay=2.0,
                backoff_factor=2.0
            )
            
            if success and isinstance(result, dict):
                if "update" in result:
                    all_results["update"].extend(result["update"])
                else:
                    failed_items.extend(batch)
            else:
                # Batch failed after retry, try splitting
                if len(batch) > 25:
                    mid = len(batch) // 2
                    batch1 = batch[:mid]
                    batch2 = batch[mid:]
                    
                    for sub_batch in [batch1, batch2]:
                        sub_payload = {"update": sub_batch}
                        async def make_sub_request():
                            try:
                                response = await self._request("POST", f"/wp-json/wc/v3/products/{product_id}/variations/batch", json_data=sub_payload)
                                if response.status_code == 200:
                                    return True, response.json(), response.status_code
                                return False, response.text[:500], response.status_code
                            except Exception as e:
                                return False, str(e), None
                        
                        sub_success, sub_result, _ = await retry_with_backoff_async(
                            make_sub_request,
                            max_retries=2,
                            initial_delay=2.0
                        )
                        
                        if sub_success and isinstance(sub_result, dict) and "update" in sub_result:
                            all_results["update"].extend(sub_result["update"])
                        else:
                            failed_items.extend(sub_batch)
                else:
                    failed_items.extend(batch)
            
            # Delay between batches
            if i + batch_limit < len(updates):
                await asyncio.sleep(delay_between_batches)
        
        return all_results, failed_items
    
    async def get_product_by_slug(self, slug: str) -> Optional[Dict]:
        """
        Get product by slug.
        
        Args:
            slug: Product slug
        
        Returns:
            Product dict or None if not found
        """
        try:
            params = {"slug": slug, "per_page": 1}
            response = await self._request("GET", "/wp-json/wc/v3/products", params=params)
            products = response.json()
            
            if products and len(products) > 0:
                return products[0]
            return None
        except Exception:
            return None
    
    async def get_products_by_category(self, category_id: int) -> List[int]:
        """
        Get all product IDs in a category (alias for fetch_products_by_category).
        
        Args:
            category_id: Category ID
        
        Returns:
            List of product IDs
        """
        return await self.fetch_products_by_category(category_id, status="any")
    
    async def get_all_product_ids(self) -> Tuple[List[int], Optional[int]]:
        """
        Get all product IDs in the store.
        
        Returns:
            (product_ids, total_count)
        """
        all_ids = []
        page = 1
        per_page = 100
        total = None
        
        while True:
            params = {
                "per_page": per_page,
                "page": page,
                "status": "any"
            }
            
            try:
                response = await self._request("GET", "/wp-json/wc/v3/products", params=params)
                items = response.json()
                
                if total is None:
                    total = int(response.headers.get("X-WP-Total", 0))
                
                if not items:
                    break
                
                ids = [p["id"] for p in items]
                all_ids.extend(ids)
                
                if len(items) < per_page:
                    break
                page += 1
            except Exception:
                break
        
        return all_ids, total
    
    async def close(self):
        """Close HTTP client."""
        await self.client.aclose()

