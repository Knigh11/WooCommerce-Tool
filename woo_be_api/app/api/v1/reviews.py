"""
Reviews API endpoints.
"""

from fastapi import APIRouter, HTTPException, status, BackgroundTasks, UploadFile, File
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse
import re
import tempfile
import os

from app.deps import get_woo_client_for_store, get_wp_client_for_store, get_redis
from app.core.events import JobEventEmitter, JobStateManager
from app.schemas.reviews import ReviewCreateRequest, ReviewResponse, ReviewsByURLRequest
from app.schemas.jobs import JobCreateResponse

router = APIRouter()


def extract_slug_from_url(url: str) -> Optional[str]:
    """Extract product slug from URL."""
    try:
        parsed = urlparse(url)
        path = parsed.path.strip("/")
        parts = path.split("/")
        if "product" in parts:
            idx = parts.index("product")
            if idx + 1 < len(parts):
                slug = parts[idx + 1]
                return slug.strip("/")
        # Fallback: get last non-empty part
        for part in reversed(parts):
            if part:
                return part
        return None
    except Exception:
        return None


@router.post("/by-urls")
async def get_products_and_reviews_by_urls(store_id: str, request: ReviewsByURLRequest):
    """Fetch products and their reviews by URLs."""
    client = get_woo_client_for_store(store_id)
    
    try:
        results = []
        
        for url in request.urls:
            url = url.strip()
            if not url:
                continue
            
            slug = extract_slug_from_url(url)
            if not slug:
                results.append({
                    "url": url,
                    "error": "Cannot extract slug from URL"
                })
                continue
            
            try:
                # Get product by slug
                product = await client.get_product_by_slug(slug)
                if not product:
                    results.append({
                        "url": url,
                        "error": "Product not found"
                    })
                    continue
                
                product_id = product.get("id")
                product_name = product.get("name", "")
                
                # Get reviews for this product
                reviews = []
                try:
                    response = await client._request(
                        "GET",
                        "/wp-json/wc/v3/products/reviews",
                        params={"product": product_id, "per_page": 100}
                    )
                    reviews_data = response.json()
                    
                    for review in reviews_data:
                        reviews.append({
                            "id": review.get("id"),
                            "reviewer": review.get("reviewer", ""),
                            "reviewer_email": review.get("reviewer_email", ""),
                            "rating": review.get("rating", 0),
                            "review": review.get("review", ""),
                            "status": review.get("status", ""),
                            "date_created": review.get("date_created"),
                            "images": []  # Reviews don't have images in WooCommerce API
                        })
                except Exception as e:
                    pass  # No reviews or error fetching
                
                results.append({
                    "url": url,
                    "product_id": product_id,
                    "product_name": product_name,
                    "permalink": product.get("permalink", url),
                    "reviews": reviews
                })
                
            except Exception as e:
                results.append({
                    "url": url,
                    "error": str(e)
                })
        
        return {"results": results}
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching products: {str(e)}"
        )
    finally:
        await client.close()


@router.post("", response_model=ReviewResponse)
async def create_review(store_id: str, request: ReviewCreateRequest):
    """Create a product review."""
    client = get_woo_client_for_store(store_id)
    wp_client = None
    
    try:
        # Get product info
        product = await client.get_product(request.product_id)
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product {request.product_id} not found"
            )
        
        product_name = product.get("name", "")
        
        # Create review
        review_data = {
            "product_id": request.product_id,
            "review": request.review_text,
            "reviewer": request.reviewer,
            "reviewer_email": request.reviewer_email,
            "rating": request.rating,
            "status": "approved"
        }
        
        review = await client.create_review(review_data)
        review_id = review.get("id")
        
        # Upload images if provided
        image_ids = []
        if request.image_urls:
            try:
                wp_client = get_wp_client_for_store(store_id)
            except:
                pass  # WP client optional
            
            if wp_client:
                from app.core.ops.csv_import import upload_image_to_wp
                for idx, image_url in enumerate(request.image_urls, 1):
                    filename = f"review-{review_id}-{idx}"
                    alt_text = f"Review image {idx} for {product_name}"
                    media_id = await upload_image_to_wp(wp_client, image_url, filename, alt_text)
                    if media_id:
                        image_ids.append({"id": media_id})
        
        return ReviewResponse(
            id=review_id,
            product_id=request.product_id,
            product_name=product_name,
            reviewer=request.reviewer,
            reviewer_email=request.reviewer_email,
            rating=request.rating,
            review_text=request.review_text,
            status="approved",
            date_created=review.get("date_created"),
            images=image_ids if image_ids else None
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating review: {str(e)}"
        )
    finally:
        await client.close()
        if wp_client:
            await wp_client.close()


@router.post("/batch", response_model=JobCreateResponse)
async def create_reviews_batch_job(
    store_id: str,
    reviews: List[ReviewCreateRequest],
    background_tasks: BackgroundTasks
):
    """Create multiple reviews as a background job."""
    try:
        redis = await get_redis()
        await redis.ping()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Redis connection failed: {str(e)}"
        )
    
    state_manager = JobStateManager(redis)
    
    try:
        job_id = await state_manager.create_job(
            store_id=store_id,
            job_type="create-reviews",
            params={
                "reviews": [r.dict() for r in reviews]
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create job: {str(e)}"
        )
    
    # Start job in background
    background_tasks.add_task(
        _run_reviews_job,
        job_id=job_id,
        store_id=store_id,
        reviews=[r.dict() for r in reviews]
    )
    
    return JobCreateResponse(job_id=job_id, status="queued")


async def _run_reviews_job(
    job_id: str,
    store_id: str,
    reviews: List[Dict[str, Any]]
):
    """Background task to create reviews."""
    from app.deps import get_woo_client_for_store, get_wp_client_for_store, get_redis
    from app.core.events import JobEventEmitter, JobStateManager
    
    redis = await get_redis()
    client = get_woo_client_for_store(store_id)
    emitter = JobEventEmitter(redis, job_id)
    state_manager = JobStateManager(redis)
    
    wp_client = None
    try:
        wp_client = get_wp_client_for_store(store_id)
    except:
        pass
    
    try:
        await emitter.emit_status("running", total=len(reviews))
        
        success = 0
        failed = 0
        
        for idx, review_data in enumerate(reviews, 1):
            # Check for pause/stop
            state = await state_manager.get_job_state(job_id)
            if state and state.get("status") == "cancelled":
                await emitter.emit_log("warning", "Job đã bị hủy")
                break
            
            try:
                # Get product info
                product = await client.get_product(review_data["product_id"])
                product_name = product.get("name", "") if product else ""
                
                # Create review
                review_payload = {
                    "product_id": review_data["product_id"],
                    "review": review_data["review_text"],
                    "reviewer": review_data["reviewer"],
                    "reviewer_email": review_data["reviewer_email"],
                    "rating": review_data["rating"],
                    "status": "approved"
                }
                
                review = await client.create_review(review_payload)
                review_id = review.get("id")
                
                # Upload images if provided
                if review_data.get("image_urls") and wp_client:
                    from app.core.ops.csv_import import upload_image_to_wp
                    for img_idx, image_url in enumerate(review_data["image_urls"], 1):
                        filename = f"review-{review_id}-{img_idx}"
                        alt_text = f"Review image {img_idx} for {product_name}"
                        await upload_image_to_wp(wp_client, image_url, filename, alt_text)
                
                await emitter.emit_log("success", f"Đã tạo review cho {product_name}")
                success += 1
                
            except Exception as e:
                await emitter.emit_log("error", f"Lỗi tạo review: {str(e)}")
                failed += 1
            
            await emitter.emit_progress(done=idx, total=len(reviews), success=success, failed=failed)
        
        await emitter.emit_log("info", f"Hoàn thành: {success} thành công, {failed} thất bại")
        await emitter.emit_status("done", total=len(reviews))
        
    except Exception as e:
        await emitter.emit_log("error", f"Lỗi: {str(e)}")
        await emitter.emit_status("failed", total=len(reviews))
    finally:
        await client.close()
        if wp_client:
            await wp_client.close()


@router.delete("/{review_id}")
async def delete_review(store_id: str, review_id: int):
    """Delete a review and its associated media."""
    client = get_woo_client_for_store(store_id)
    wp_client = None
    
    try:
        # Get WP client for media deletion
        try:
            wp_client = get_wp_client_for_store(store_id)
        except:
            pass  # WP client optional
        
        # Get review images before deletion (if custom endpoint available)
        media_ids = []
        if wp_client:
            try:
                # Try to get review images via custom endpoint
                response = await client._request(
                    "GET",
                    "/wp-json/wc/v3/equineop/review-images",
                    params={"review_id": review_id}
                )
                if response.status_code == 200:
                    data = response.json()
                    if isinstance(data, list):
                        media_ids = data
                    elif isinstance(data, dict) and "images" in data:
                        media_ids = data["images"]
            except:
                pass  # Endpoint not available or error - continue with deletion
        
        # Delete media first
        if wp_client and media_ids:
            for media_id in media_ids:
                try:
                    await wp_client.delete_media(media_id, force=True)
                except:
                    pass  # Ignore media deletion errors
        
        # Delete review
        response = await client._request(
            "DELETE",
            f"/wp-json/wc/v3/products/reviews/{review_id}",
            params={"force": "true"}
        )
        
        if response.status_code in (200, 204, 404, 410):
            return {"success": True, "message": "Review deleted successfully"}
        else:
            error_msg = response.text[:200] if hasattr(response, 'text') else str(response.status_code)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to delete review: {error_msg}"
            )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting review: {str(e)}"
        )
    finally:
        await client.close()
        if wp_client:
            await wp_client.close()


@router.post("/{review_id}/verify")
async def verify_review(store_id: str, review_id: int):
    """Mark review as verified owner via custom endpoint."""
    client = get_woo_client_for_store(store_id)
    
    try:
        # Call custom endpoint to mark review as verified
        # This matches desktop app logic: /wp-json/wc/v3/equineop/mark-verified
        response = await client._request(
            "POST",
            "/wp-json/wc/v3/equineop/mark-verified",
            json_data={"review_id": review_id}
        )
        
        if response.status_code == 200:
            return {"success": True, "message": "Review marked as verified"}
        else:
            error_msg = response.text[:200] if hasattr(response, 'text') else str(response.status_code)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to verify review: {error_msg}"
            )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error verifying review: {str(e)}"
        )
    finally:
        await client.close()


@router.post("/{review_id}/images", response_model=Dict[str, Any])
async def upload_review_images(
    store_id: str,
    review_id: int,
    files: List[UploadFile] = File(...)
):
    """Upload images for a review and attach them."""
    client = get_woo_client_for_store(store_id)
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
                    
                    if result and result.get("id"):
                        media_id = result["id"]
                        
                        # Attach image to review via custom endpoint
                        # This matches desktop app logic: /wp-json/wc/v3/equineop/attach-review-image
                        attach_response = await client._request(
                            "POST",
                            "/wp-json/wc/v3/equineop/attach-review-image",
                            json_data={
                                "review_id": review_id,
                                "media_id": media_id
                            }
                        )
                        
                        if attach_response.status_code == 200:
                            uploaded_images.append({
                                "id": media_id,
                                "src": result.get("src", ""),
                                "alt": result.get("alt", "")
                            })
                        else:
                            # Upload succeeded but attach failed - log but continue
                            pass
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
                detail="No valid images were uploaded or attached"
            )
        
        return {
            "success": True,
            "message": f"Uploaded and attached {len(uploaded_images)} image(s)",
            "images": uploaded_images
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error uploading images: {str(e)}"
        )
    finally:
        await client.close()
        if wp_client:
            await wp_client.close()

