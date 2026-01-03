"""
V2 Description Builder schemas.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


class LeafItem(BaseModel):
    """Leaf folder item from ZIP scan."""
    id: str = Field(..., description="Stable hash of rel_path")
    rel_path: str = Field(..., description="Leaf folder path relative to root (no leading /)")
    title: str = Field(..., description="Folder name (title)")
    category: Optional[str] = Field(None, description="Category from parent folder")
    has_description: bool = Field(..., description="Whether ZIP contains description.txt in this folder")


class UploadZipResponse(BaseModel):
    """Response from upload-zip endpoint."""
    upload_id: str = Field(..., description="Upload session ID")
    upload_token: str = Field(..., description="Upload token for subsequent requests")
    root_name: Optional[str] = Field(None, description="Detected root folder name")
    multiple_roots: bool = Field(..., description="Whether ZIP has multiple root folders")
    zip_size: int = Field(..., description="ZIP file size in bytes")
    items: List[LeafItem] = Field(..., description="List of leaf folders found")
    summary: Dict[str, int] = Field(..., description="Summary statistics")


class DescBuilderConfig(BaseModel):
    """Description builder configuration."""
    preset: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Preset overrides: product_type, fit, use, seo_keywords (optional, will use category default if not provided)"
    )
    template: Optional[str] = Field(
        None,
        description="Description template with placeholders (optional, uses default if not provided)"
    )
    anchors: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Anchor keywords: {keywords: string[] | string (newline-separated)}"
    )
    anchor_options: Optional[Dict[str, bool]] = Field(
        default_factory=dict,
        description="Anchor options: append_to_keywords, append_as_bullet, append_at_end"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "preset": {
                    "product_type": "t-shirt",
                    "fit": "unisex classic fit",
                    "use": "everyday outfits and casual streetwear",
                    "seo_keywords": ["t-shirt", "graphic tee", "all over print t-shirt"]
                },
                "template": "{{title}} is a premium {{product_type}}...",
                "anchors": {
                    "keywords": ["fashion", "streetwear", "casual"]
                },
                "anchor_options": {
                    "append_to_keywords": True,
                    "append_as_bullet": False,
                    "append_at_end": False
                }
            }
        }


class PreviewRequest(BaseModel):
    """Request for preview endpoint."""
    upload_id: str = Field(..., description="Upload session ID from upload-zip response")
    upload_token: str = Field(..., description="Upload token from upload-zip response")
    rel_path: str = Field(..., description="Relative path of leaf folder to preview (from items list in upload response)")
    config: DescBuilderConfig = Field(..., description="Configuration: preset, template, anchors, options")


class PreviewResponse(BaseModel):
    """Response from preview endpoint."""
    text: str = Field(..., description="Rendered description text")


class GenerateRequest(BaseModel):
    """Request for generate endpoint."""
    upload_id: str = Field(..., description="Upload session ID from upload-zip response")
    upload_token: str = Field(..., description="Upload token from upload-zip response")
    rel_paths: List[str] = Field(..., description="List of rel_paths to generate (from items list in upload response)")
    config: DescBuilderConfig = Field(..., description="Configuration: preset, template, anchors, options")
    overwrite: bool = Field(True, description="Whether to overwrite existing descriptions")


class GenerateResponse(BaseModel):
    """Response from generate endpoint."""
    job_id: str = Field(..., description="Background job ID")
    job_token: str = Field(..., description="Job token for SSE and download access")


class PresetInfo(BaseModel):
    """Preset information."""
    category_key: str = Field(..., description="Category key (normalized)")
    display_name: str = Field(..., description="Display name for category")
    product_type: str = Field(..., description="Product type")
    fit: str = Field(..., description="Fit")
    use: str = Field(..., description="Use")
    seo_keywords: List[str] = Field(..., description="SEO keywords")


class PresetListResponse(BaseModel):
    """Response for listing presets."""
    presets: List[PresetInfo] = Field(..., description="List of available presets")
    default_template: str = Field(..., description="Default template")

