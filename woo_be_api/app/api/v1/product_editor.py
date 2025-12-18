"""
Product Editor API endpoints.
"""

import tempfile
import os
from fastapi import APIRouter, HTTPException, status, Query, UploadFile, File
from typing import Optional, List

from app.deps import get_woo_client_for_store, get_wp_client_for_store
from app.schemas.product_editor import EditableProductSchema, ProductUpdateRequest, EditableImageSchema
from app.core.ops.product_editor import fetch_product_for_editor, update_product_from_editor

router = APIRouter()


@router.get("/by-url", response_model=EditableProductSchema)
async def get_product_by_url(store_id: str, url: str = Query(..., description="Product URL")):
    """Fetch product details by URL for editing."""
    client = get_woo_client_for_store(store_id)
    
    try:
        product = await fetch_product_for_editor(client, product_url=url)
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Product not found"
            )
        return product
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching product: {str(e)}"
        )
    finally:
        await client.close()


@router.get("/{product_id}", response_model=EditableProductSchema)
async def get_product_for_editor(store_id: str, product_id: int):
    """Fetch product details by ID for editing."""
    client = get_woo_client_for_store(store_id)
    
    try:
        product = await fetch_product_for_editor(client, product_id=product_id)
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product {product_id} not found"
            )
        return product
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching product: {str(e)}"
        )
    finally:
        await client.close()


@router.put("/{product_id}", response_model=dict)
async def update_product_details(
    store_id: str,
    product_id: int,
    request: ProductUpdateRequest
):
    """Update product details from editor."""
    client = get_woo_client_for_store(store_id)
    wp_client = None
    
    try:
        # Get WP client if available
        try:
            wp_client = get_wp_client_for_store(store_id)
        except:
            pass  # WP client optional
        
        # Build product data dict
        product_data = {
            "name": request.name,
            "short_description": request.short_description or "",
            "description": request.description or "",
            "attributes": [attr.dict() for attr in (request.attributes or [])],
            "images": [img.dict() for img in (request.images or [])],
            "variations": [var.dict() for var in (request.variations or [])],
            "images_to_delete_media_ids": request.images_to_delete_media_ids or []
        }
        
        # Update product
        results = await update_product_from_editor(client, wp_client, product_id, product_data)
        
        return {
            "success": True,
            "product_id": product_id,
            "results": results
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating product: {str(e)}"
        )
    finally:
        await client.close()
        if wp_client:
            await wp_client.close()


@router.post("/{product_id}/images/upload", response_model=List[EditableImageSchema])
async def upload_product_images(
    store_id: str,
    product_id: int,
    files: List[UploadFile] = File(...)
):
    """Upload images and return image data for product editor."""
    wp_client = None
    
    try:
        # Get WP client (required for uploads)
        try:
            wp_client = get_wp_client_for_store(store_id)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"WordPress client not available: {str(e)}"
            )
        
        uploaded_images = []
        
        for file in files:
            # Validate file type
            if not file.content_type or not file.content_type.startswith('image/'):
                continue
            
            # Save uploaded file to temporary location
            with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp_file:
                try:
                    # Read file content
                    content = await file.read()
                    tmp_file.write(content)
                    tmp_file_path = tmp_file.name
                    
                    # Upload to WordPress
                    result = await wp_client.upload_media(tmp_file_path)
                    
                    if result:
                        uploaded_images.append(EditableImageSchema(
                            id=result.get("id"),
                            src=result.get("src", ""),
                            alt=result.get("alt", ""),
                            position=0,  # Will be set by frontend
                            delete_from_media=False
                        ))
                finally:
                    # Clean up temp file
                    if os.path.exists(tmp_file_path):
                        try:
                            os.unlink(tmp_file_path)
                        except:
                            pass
        
        if not uploaded_images:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No valid images were uploaded"
            )
        
        return uploaded_images
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error uploading images: {str(e)}"
        )
    finally:
        if wp_client:
            await wp_client.close()
