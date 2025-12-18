"""
Products API endpoints.
"""

from fastapi import APIRouter, Query, HTTPException, status
from typing import Optional

from app.deps import get_woo_client_for_store
from app.core.woo_client import WooClient
from app.core.image_resolver import normalize_product_image_summary, normalize_product_images_detail
from app.schemas.products import ProductListResponse, ProductSummary, ProductDetail

router = APIRouter()


@router.get("", response_model=ProductListResponse)
async def list_products(
    store_id: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    search: Optional[str] = Query(None),
    include_image: bool = Query(True)
):
    """
    List products for a store.
    """
    client = get_woo_client_for_store(store_id)
    
    try:
        result = await client.get_products(
            page=page,
            per_page=per_page,
            search=search
        )
        
        items = []
        base_url = None  # Could be passed from request if needed
        
        for product in result.get("items", []):
            # Get variations count for variable products
            variations_count = None
            if product.get("type") == "variable":
                try:
                    var_data = await client.get_variations(product.get("id"), per_page=1)
                    variations_count = var_data.get("total", 0)
                except:
                    pass
            
            image = normalize_product_image_summary(product, base_url) if include_image else {
                "mode": "none",
                "original": "",
                "thumb": ""
            }
            
            items.append(ProductSummary(
                id=product.get("id"),
                name=product.get("name", ""),
                type=product.get("type", "simple"),
                status=product.get("status", "publish"),
                price=product.get("price"),
                stock_status=product.get("stock_status"),
                variations_count=variations_count,
                image=image
            ))
        
        return ProductListResponse(
            page=result.get("page", page),
            per_page=result.get("per_page", per_page),
            total=result.get("total"),
            items=items
        )
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching products: {str(e)}"
        )
    finally:
        await client.close()


@router.get("/{product_id}", response_model=ProductDetail)
async def get_product(store_id: str, product_id: int):
    """
    Get product details.
    """
    client = get_woo_client_for_store(store_id)
    
    try:
        product = await client.get_product(product_id)
        
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product {product_id} not found"
            )
        
        images = normalize_product_images_detail(product)
        
        return ProductDetail(
            id=product.get("id"),
            name=product.get("name", ""),
            type=product.get("type", "simple"),
            status=product.get("status", "publish"),
            sku=product.get("sku"),
            price=product.get("price"),
            regular_price=product.get("regular_price"),
            sale_price=product.get("sale_price"),
            stock_status=product.get("stock_status"),
            stock_quantity=product.get("stock_quantity"),
            short_description=product.get("short_description"),
            description=product.get("description"),
            image=images["image"],
            gallery=images["gallery"],
            meta_data=product.get("meta_data")  # Include if needed
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching product: {str(e)}"
        )
    finally:
        await client.close()

