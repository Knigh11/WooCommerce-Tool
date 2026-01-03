"""
V2 ProductCardService - Search and fetch products with caching.
"""

import time
from typing import List, Optional, Dict, Tuple
from app.core.woo_client import WooClient
from app.schemas.v2.products import ProductCard


class ProductCardCache:
    """Simple in-memory cache for ProductCard with TTL"""
    
    def __init__(self, ttl_seconds: int = 120):
        self.ttl = ttl_seconds
        self._cache: Dict[int, tuple[ProductCard, float]] = {}
    
    def get(self, product_id: int) -> Optional[ProductCard]:
        """Get cached ProductCard if not expired"""
        if product_id not in self._cache:
            return None
        
        card, timestamp = self._cache[product_id]
        if time.time() - timestamp > self.ttl:
            del self._cache[product_id]
            return None
        
        return card
    
    def set(self, product_id: int, card: ProductCard):
        """Cache ProductCard with current timestamp"""
        self._cache[product_id] = (card, time.time())
    
    def clear(self):
        """Clear all cache"""
        self._cache.clear()


class ProductCardService:
    """Service for fetching and caching ProductCards"""
    
    def __init__(self, woo_client: WooClient, cache_ttl: int = 120):
        self.woo_client = woo_client
        self.cache = ProductCardCache(ttl_seconds=cache_ttl)
    
    def _product_to_card(self, product: dict) -> ProductCard:
        """Convert WooCommerce product dict to ProductCard"""
        # Get image URL (first image or None)
        image_url = None
        if product.get("images") and len(product["images"]) > 0:
            image_url = product["images"][0].get("src")
        
        # Get price (regular price or sale price)
        price = product.get("regular_price") or product.get("sale_price")
        if price:
            price = str(price)
        
        return ProductCard(
            id=product["id"],
            type=product.get("type", "simple"),
            title=product.get("name", f"Product #{product['id']}"),
            image_url=image_url,
            sku=product.get("sku"),
            price=price
        )
    
    async def search(self, query: str, limit: int = 20) -> List[ProductCard]:
        """
        Search products and return ProductCards.
        Fast, debounce-friendly.
        """
        try:
            # Search products via WooCommerce API
            params = {
                "search": query,
                "per_page": min(limit, 100),
                "page": 1
            }
            
            response = await self.woo_client._request(
                "GET",
                "/wp-json/wc/v3/products",
                params=params
            )
            
            products = response.json()
            cards = [self._product_to_card(p) for p in products]
            
            # Cache the results
            for card in cards:
                self.cache.set(card.id, card)
            
            return cards
        except Exception as e:
            # Return empty list on error (don't break search)
            return []
    
    async def get_cards(self, product_ids: List[int]) -> List[ProductCard]:
        """
        Get ProductCards for given IDs.
        Preserves order of input IDs.
        Uses cache when available, fetches missing ones in batches.
        """
        if not product_ids:
            return []
        
        # Check cache first
        cached_cards: Dict[int, ProductCard] = {}
        missing_ids: List[int] = []
        
        for product_id in product_ids:
            cached = self.cache.get(product_id)
            if cached:
                cached_cards[product_id] = cached
            else:
                missing_ids.append(product_id)
        
        # Fetch missing products in batches
        fetched_cards: Dict[int, ProductCard] = {}
        if missing_ids:
            # WooCommerce API supports batch requests, but we'll do chunks of 20
            chunk_size = 20
            
            for i in range(0, len(missing_ids), chunk_size):
                chunk = missing_ids[i:i + chunk_size]
                
                try:
                    # Fetch products by ID (WooCommerce supports include parameter)
                    params = {
                        "include": ",".join(map(str, chunk)),
                        "per_page": len(chunk)
                    }
                    
                    response = await self.woo_client._request(
                        "GET",
                        "/wp-json/wc/v3/products",
                        params=params
                    )
                    
                    products = response.json()
                    for product in products:
                        card = self._product_to_card(product)
                        fetched_cards[product["id"]] = card
                        self.cache.set(card.id, card)
                except Exception as e:
                    # Continue with other chunks on error
                    pass
            
            # Add fetched cards to cached_cards
            for product_id, card in fetched_cards.items():
                cached_cards[product_id] = card
        
        # Build result in order of input product_ids
        result: List[ProductCard] = []
        for product_id in product_ids:
            if product_id in cached_cards:
                result.append(cached_cards[product_id])
            elif product_id in fetched_cards:
                result.append(fetched_cards[product_id])
            else:
                # Product not found - create a minimal card
                card = ProductCard(
                    id=product_id,
                    type="simple",
                    title=f"Product #{product_id} (not found)",
                    image_url=None,
                    sku=None,
                    price=None
                )
                result.append(card)
        
        return result

