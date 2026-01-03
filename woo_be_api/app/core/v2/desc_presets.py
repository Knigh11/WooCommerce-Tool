"""
Category presets and configuration for description generation.
Adapted from desktop module.
"""

import re
from typing import Dict, Optional, List, Any


def normalize_category(name: str) -> str:
    """Normalize category name to key format (lowercase, alphanumeric only)."""
    return re.sub(r'[^a-z0-9]+', '', name.lower())


# Default category configuration
DEFAULT_CATEGORY_CONFIG = {
    "bomber": {
        "product_type": "bomber jacket",
        "fit": "regular fit",
        "use": "daily wear, streetwear and layering",
        "seo_keywords": [
            "bomber jacket",
            "all over print bomber",
            "streetwear bomber"
        ]
    },
    "hawai": {
        "product_type": "Hawaiian shirt",
        "fit": "relaxed fit",
        "use": "summer, beach trips and vacations",
        "seo_keywords": [
            "Hawaiian shirt",
            "all over print hawaiian",
            "vacation shirt"
        ]
    },
    "hoodie": {
        "product_type": "hoodie",
        "fit": "unisex relaxed fit",
        "use": "casual days, streetwear and chilly weather",
        "seo_keywords": [
            "hoodie",
            "pullover hoodie",
            "all over print hoodie"
        ]
    },
    "hoodiezip": {
        "product_type": "zip hoodie",
        "fit": "unisex relaxed fit",
        "use": "layering, everyday wear and outdoor activities",
        "seo_keywords": [
            "zip hoodie",
            "full zip hoodie",
            "all over print zip hoodie"
        ]
    },
    "pants": {
        "product_type": "jogger pants",
        "fit": "tapered fit",
        "use": "streetwear, lounging and workouts",
        "seo_keywords": [
            "jogger pants",
            "all over print joggers",
            "streetwear pants"
        ]
    },
    "polo": {
        "product_type": "polo shirt",
        "fit": "regular fit",
        "use": "casual outfits, work and golf days",
        "seo_keywords": [
            "polo shirt",
            "all over print polo",
            "casual polo"
        ]
    },
    "short": {
        "product_type": "shorts",
        "fit": "above-knee fit",
        "use": "summer, workouts and casual wear",
        "seo_keywords": [
            "shorts",
            "all over print shorts",
            "sport shorts"
        ]
    },
    "sweatshirt": {
        "product_type": "sweatshirt",
        "fit": "unisex relaxed fit",
        "use": "layering, casual streetwear and cooler days",
        "seo_keywords": [
            "sweatshirt",
            "crewneck sweatshirt",
            "all over print sweatshirt"
        ]
    },
    "tshirt": {
        "product_type": "t-shirt",
        "fit": "unisex classic fit",
        "use": "everyday outfits and casual streetwear",
        "seo_keywords": [
            "t-shirt",
            "graphic tee",
            "all over print t-shirt"
        ]
    },
    "tracksuit": {
        "product_type": "track suit",
        "fit": "relaxed athletic fit",
        "use": "warm-ups, jogging and casual streetwear",
        "seo_keywords": [
            "track suit",
            "jogging set",
            "all over print track suit"
        ]
    }
}


class PresetManager:
    """Manages category presets with store-specific overrides."""

    def __init__(self, base_config: Optional[Dict] = None):
        self.base_config = base_config or DEFAULT_CATEGORY_CONFIG.copy()
        self.store_overrides: Dict[str, Dict] = {}

    def get_preset(self, category_folder: str, store_id: Optional[str] = None) -> Dict[str, Any]:
        """Get preset for a category, with optional store override."""
        cat_key = normalize_category(category_folder)
        
        # Try store override first
        if store_id and store_id in self.store_overrides:
            store_config = self.store_overrides[store_id]
            if cat_key in store_config:
                return store_config[cat_key].copy()
        
        # Fall back to base config
        cfg = self.base_config.get(cat_key, {
            "product_type": "apparel piece",
            "fit": "regular fit",
            "use": "daily wear",
            "seo_keywords": ["fashion", "all over print", "streetwear"]
        })
        
        return cfg.copy()

    def get_all_presets(self, store_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get all available presets.
        
        Returns list of presets with category_key, display_name, and preset data.
        """
        presets = []
        
        # Get base presets
        for cat_key, preset_data in self.base_config.items():
            presets.append({
                "category_key": cat_key,
                "display_name": cat_key.title(),  # Simple title case
                **preset_data
            })
        
        # Add store-specific presets (override base if exists)
        if store_id and store_id in self.store_overrides:
            store_config = self.store_overrides[store_id]
            for cat_key, preset_data in store_config.items():
                # Find existing or add new
                existing_idx = None
                for idx, p in enumerate(presets):
                    if p["category_key"] == cat_key:
                        existing_idx = idx
                        break
                
                if existing_idx is not None:
                    presets[existing_idx].update(preset_data)
                else:
                    presets.append({
                        "category_key": cat_key,
                        "display_name": cat_key.title(),
                        **preset_data
                    })
        
        # Sort by category_key
        presets.sort(key=lambda x: x["category_key"])
        return presets

    def get_preset_by_key(self, category_key: str, store_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Get preset by category key."""
        cat_key = normalize_category(category_key)
        
        # Try store override first
        if store_id and store_id in self.store_overrides:
            store_config = self.store_overrides[store_id]
            if cat_key in store_config:
                return {
                    "category_key": cat_key,
                    "display_name": cat_key.title(),
                    **store_config[cat_key]
                }
        
        # Fall back to base config
        if cat_key in self.base_config:
            return {
                "category_key": cat_key,
                "display_name": cat_key.title(),
                **self.base_config[cat_key]
            }
        
        return None

    def load_store_presets(self, store_id: str, presets_dict: Dict[str, Dict]) -> bool:
        """Load store-specific presets from dict."""
        try:
            self.store_overrides[store_id] = presets_dict
            return True
        except Exception:
            return False

