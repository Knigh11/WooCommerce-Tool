"""
Categories API endpoints.
"""

from fastapi import APIRouter, HTTPException, status, Query, UploadFile, File
from typing import Optional, List, Dict

from app.deps import get_woo_client_for_store, get_wp_client_for_store
from app.core.category_utils import build_category_tree, flatten_tree_for_display, CategoryNode
from app.schemas.categories import (
    CategoriesResponse, CategoryResponse, CategoryNode as CategoryNodeSchema,
    CategoryCreateRequest, CategoryUpdateRequest, BulkCategoryActionRequest
)

router = APIRouter()


@router.get("", response_model=CategoriesResponse)
async def get_categories(store_id: str):
    """
    Get all categories with tree structure.
    """
    client = get_woo_client_for_store(store_id)
    
    try:
        # Get all categories
        raw_categories = await client.get_all_categories()
        
        # Build tree
        tree_roots = build_category_tree(raw_categories)
        
        # Flatten for display
        flattened = flatten_tree_for_display(tree_roots)
        
        # Convert CategoryNode to dict for JSON serialization
        def node_to_dict(node: CategoryNode) -> dict:
            # Ensure image_src is string or None, never boolean or other types
            image_src = node.image_src
            if image_src is not None and not isinstance(image_src, str):
                image_src = str(image_src) if image_src else None
            
            return {
                "id": node.id,
                "name": node.name,
                "parent": node.parent,
                "count": node.count,
                "level": node.level,
                "full_path": node.full_path,
                "image_id": node.image_id,
                "image_src": image_src,
                "slug": node.slug,
                "description": node.description,
                "children": [node_to_dict(child) for child in node.children]
            }
        
        tree_dicts = [node_to_dict(root) for root in tree_roots]
        flattened_dicts = [node_to_dict(node) for node in flattened]
        
        return CategoriesResponse(
            raw_categories=raw_categories,
            tree=tree_dicts,
            flattened=flattened_dicts
        )
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching categories: {str(e)}"
        )
    finally:
        await client.close()


@router.get("/{category_id}/products")
async def get_products_in_category(
    store_id: str,
    category_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=100),
    status: str = Query("any", description="Product status filter")
):
    """
    Get products in a category.
    """
    client = get_woo_client_for_store(store_id)
    
    try:
        # Get category info
        categories = await client.get_all_categories()
        category = next((c for c in categories if c.get("id") == category_id), None)
        
        if not category:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Category {category_id} not found"
            )
        
        # Get products
        products = await client.fetch_products_with_details_by_category(category_id)
        
        # Paginate
        start = (page - 1) * per_page
        end = start + per_page
        paginated_products = products[start:end]
        
        return {
            "category_id": category_id,
            "category_name": category.get("name", ""),
            "total": len(products),
            "page": page,
            "per_page": per_page,
            "products": paginated_products
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching products: {str(e)}"
        )
    finally:
        await client.close()


@router.post("", response_model=CategoryResponse)
async def create_category(store_id: str, request: CategoryCreateRequest):
    """Create a new category."""
    client = get_woo_client_for_store(store_id)
    
    try:
        data = {
            "name": request.name,
            "parent": request.parent,
            "description": request.description
        }
        if request.slug:
            data["slug"] = request.slug
        if request.image_id:
            data["image"] = {"id": request.image_id}
        
        category = await client.create_category(data)
        return CategoryResponse(
            id=category["id"],
            name=category["name"],
            slug=category["slug"],
            parent=category.get("parent", 0),
            description=category.get("description", ""),
            count=category.get("count", 0),
            image=category.get("image")
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating category: {str(e)}"
        )
    finally:
        await client.close()


@router.put("/{category_id}", response_model=CategoryResponse)
async def update_category(store_id: str, category_id: int, request: CategoryUpdateRequest):
    """Update a category."""
    client = get_woo_client_for_store(store_id)
    
    try:
        data = {}
        if request.name is not None:
            data["name"] = request.name
        if request.slug is not None:
            data["slug"] = request.slug
        if request.parent is not None:
            data["parent"] = request.parent
        if request.description is not None:
            data["description"] = request.description
        if request.image_id is not None:
            data["image"] = {"id": request.image_id} if request.image_id else None
        
        category = await client.update_category(category_id, data)
        return CategoryResponse(
            id=category["id"],
            name=category["name"],
            slug=category["slug"],
            parent=category.get("parent", 0),
            description=category.get("description", ""),
            count=category.get("count", 0),
            image=category.get("image")
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating category: {str(e)}"
        )
    finally:
        await client.close()


@router.delete("/{category_id}")
async def delete_category(store_id: str, category_id: int, force: bool = True):
    """Delete a category."""
    client = get_woo_client_for_store(store_id)
    
    try:
        success = await client.delete_category(category_id, force=force)
        if success:
            return {"success": True, "message": "Category deleted"}
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete category"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting category: {str(e)}"
        )
    finally:
        await client.close()


@router.get("/{category_id}", response_model=CategoryResponse)
async def get_category(store_id: str, category_id: int):
    """Get a single category by ID."""
    client = get_woo_client_for_store(store_id)
    
    try:
        response = await client._request("GET", f"/wp-json/wc/v3/products/categories/{category_id}")
        category = response.json()
        
        return CategoryResponse(
            id=category["id"],
            name=category["name"],
            slug=category["slug"],
            parent=category.get("parent", 0),
            description=category.get("description", ""),
            count=category.get("count", 0),
            image=category.get("image")
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching category: {str(e)}"
        )
    finally:
        await client.close()


@router.post("/{category_id}/image/upload", response_model=CategoryResponse)
async def upload_category_image(
    store_id: str,
    category_id: int,
    file: UploadFile = File(...)
):
    """Upload image for a category."""
    wp_client = None
    woo_client = get_woo_client_for_store(store_id)
    
    try:
        # Get WP client
        try:
            wp_client = get_wp_client_for_store(store_id)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"WordPress client not configured: {str(e)}"
            )
        
        # Save file temporarily
        import tempfile
        import os
        file_ext = os.path.splitext(file.filename or "image.jpg")[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext, mode='wb') as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_path = tmp_file.name
        
        try:
            # Upload to WordPress
            result = await wp_client.upload_media(tmp_path)
            if not result:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to upload image"
                )
            
            image_id = result.get("id")
            
            # Update category with image
            update_data = {"image": {"id": image_id}}
            category = await woo_client.update_category(category_id, update_data)
            
            return CategoryResponse(
                id=category["id"],
                name=category["name"],
                slug=category["slug"],
                parent=category.get("parent", 0),
                description=category.get("description", ""),
                count=category.get("count", 0),
                image=category.get("image")
            )
        finally:
            # Clean up temp file
            try:
                os.unlink(tmp_path)
            except:
                pass
                
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error uploading image: {str(e)}"
        )
    finally:
        await woo_client.close()
        if wp_client:
            await wp_client.close()


@router.post("/bulk", response_model=Dict)
async def bulk_category_actions(
    store_id: str,
    request: BulkCategoryActionRequest
):
    """Perform bulk actions on categories."""
    client = get_woo_client_for_store(store_id)
    
    try:
        results = []
        success_count = 0
        failed_count = 0
        
        if request.action == "delete":
            for cat_id in request.category_ids:
                try:
                    success = await client.delete_category(cat_id, force=True)
                    if success:
                        results.append({"category_id": cat_id, "status": "success"})
                        success_count += 1
                    else:
                        results.append({"category_id": cat_id, "status": "failed", "error": "Delete failed"})
                        failed_count += 1
                except Exception as e:
                    results.append({"category_id": cat_id, "status": "failed", "error": str(e)})
                    failed_count += 1
        
        elif request.action == "change_parent":
            new_parent_id = request.params.get("new_parent_id", 0) if request.params else 0
            
            # Validate parent changes (no cycles)
            all_categories = await client.get_all_categories()
            categories_by_id = {c.get("id"): c for c in all_categories}
            
            for cat_id in request.category_ids:
                try:
                    # Validate no cycle
                    if new_parent_id != 0:
                        # Check if new_parent is a descendant of cat_id
                        visited = {cat_id}
                        current_id = new_parent_id
                        while current_id != 0:
                            if current_id in visited:
                                results.append({"category_id": cat_id, "status": "failed", "error": "Parent change would create a cycle"})
                                failed_count += 1
                                break
                            visited.add(current_id)
                            parent_cat = categories_by_id.get(current_id)
                            if not parent_cat:
                                break
                            current_id = parent_cat.get("parent", 0)
                        else:
                            # No cycle, update
                            update_data = {"parent": new_parent_id}
                            category = await client.update_category(cat_id, update_data)
                            results.append({"category_id": cat_id, "status": "success"})
                            success_count += 1
                    else:
                        # Set to root
                        update_data = {"parent": 0}
                        category = await client.update_category(cat_id, update_data)
                        results.append({"category_id": cat_id, "status": "success"})
                        success_count += 1
                except Exception as e:
                    results.append({"category_id": cat_id, "status": "failed", "error": str(e)})
                    failed_count += 1
        
        elif request.action == "update":
            # Bulk update with same data for all categories
            update_data = request.params or {}
            for cat_id in request.category_ids:
                try:
                    category = await client.update_category(cat_id, update_data)
                    results.append({"category_id": cat_id, "status": "success"})
                    success_count += 1
                except Exception as e:
                    results.append({"category_id": cat_id, "status": "failed", "error": str(e)})
                    failed_count += 1
        
        return {
            "success": success_count,
            "failed": failed_count,
            "results": results
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error performing bulk action: {str(e)}"
        )
    finally:
        await client.close()
