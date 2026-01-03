"""
Description generator service - generates descriptions and creates ZIP patch.
"""

import zipfile
import tempfile
import os
from pathlib import Path
from typing import List, Dict, Optional, Any
from datetime import datetime

from app.core.v2.zip_scanner import ZipLeafItem
from app.core.v2.desc_template_engine import TemplateEngine, AnchorRules
from app.core.v2.desc_presets import PresetManager


class DescriptionGenerator:
    """Generates descriptions and creates ZIP patch."""
    
    def __init__(self, preset_manager: PresetManager, template_engine: TemplateEngine):
        self.preset_manager = preset_manager
        self.template_engine = template_engine
    
    def generate_one(
        self,
        item: ZipLeafItem,
        config: Dict[str, Any],
        store_id: Optional[str] = None
    ) -> tuple[bool, str, str]:
        """
        Generate description for one item.
        
        Returns:
            (success, message, description_text)
        """
        try:
            # Extract config
            preset_dict = config.get("preset", {})
            template = config.get("template")
            anchor_config = config.get("anchors", {})
            anchor_options = config.get("anchor_options", {})
            
            # Get preset (merge with category preset if needed)
            category_preset = self.preset_manager.get_preset(item.category or "", store_id)
            
            # Override with user-provided preset values
            final_preset = category_preset.copy()
            if preset_dict:
                final_preset.update(preset_dict)
            
            # Build anchor rules
            anchor_keywords = anchor_config.get("keywords", [])
            if isinstance(anchor_keywords, str):
                anchor_keywords = [k.strip() for k in anchor_keywords.split('\n') if k.strip()]
            
            anchor_rules = AnchorRules(
                keywords=anchor_keywords,
                append_to_keywords=anchor_options.get("append_to_keywords", True),
                append_as_bullet=anchor_options.get("append_as_bullet", False),
                append_at_end=anchor_options.get("append_at_end", False)
            )
            
            # Render description
            description = self.template_engine.render(
                title=item.title,
                category_folder=item.category or "",
                preset=final_preset,
                anchor_rules=anchor_rules,
                template=template
            )
            
            return True, f"Generated: {item.rel_path}", description
            
        except Exception as e:
            return False, f"Error: {item.rel_path} | {str(e)}", ""
    
    def create_patch_zip(
        self,
        items: List[ZipLeafItem],
        descriptions: Dict[str, str],  # rel_path -> description_text
        root_name: Optional[str],
        output_path: str
    ) -> str:
        """
        Create ZIP patch containing description.txt files.
        
        Args:
            items: List of leaf items that were generated
            descriptions: Dict mapping rel_path to description text
            root_name: Root folder name (if detected)
            output_path: Path to save ZIP patch
        
        Returns:
            Path to created ZIP file
        """
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            # Add description.txt files
            for item in items:
                if item.rel_path in descriptions:
                    # Determine path in ZIP
                    if root_name:
                        zip_path = f"{root_name}/{item.rel_path}/description.txt"
                    else:
                        zip_path = f"{item.rel_path}/description.txt"
                    
                    # Write description
                    description_text = descriptions[item.rel_path]
                    zf.writestr(zip_path, description_text.encode('utf-8'))
            
            # Add README.txt
            readme_text = self._generate_readme(root_name)
            zf.writestr("README.txt", readme_text.encode('utf-8'))
            
            # Add manifest.json (optional, for debugging)
            manifest = {
                "generated_at": datetime.utcnow().isoformat() + "Z",
                "root_name": root_name,
                "items": [
                    {
                        "rel_path": item.rel_path,
                        "title": item.title,
                        "category": item.category,
                        "hash": item.id
                    }
                    for item in items
                ]
            }
            import json
            zf.writestr("manifest.json", json.dumps(manifest, indent=2).encode('utf-8'))
        
        return output_path
    
    def _generate_readme(self, root_name: Optional[str]) -> str:
        """Generate README.txt with extraction instructions."""
        if root_name:
            return f"""Description Builder - ZIP Patch

This ZIP contains description.txt files for your product folders.

EXTRACTION INSTRUCTIONS:
1. Extract this ZIP into the parent folder of "{root_name}"
2. The description.txt files will be placed in the correct leaf folders
3. If "{root_name}" is your product root folder, extract this ZIP one level above it

Example:
  If your structure is: /path/to/{root_name}/category/product/
  Extract this ZIP to: /path/to/
  Result: /path/to/{root_name}/category/product/description.txt

Note: This ZIP only contains description.txt files. Your original images and other files are not included.
"""
        else:
            return """Description Builder - ZIP Patch

This ZIP contains description.txt files for your product folders.

EXTRACTION INSTRUCTIONS:
1. Extract this ZIP directly into your product root folder
2. The description.txt files will be placed in the correct leaf folders

Example:
  If your structure is: /path/to/products/category/product/
  Extract this ZIP to: /path/to/products/
  Result: /path/to/products/category/product/description.txt

Note: This ZIP only contains description.txt files. Your original images and other files are not included.
"""

