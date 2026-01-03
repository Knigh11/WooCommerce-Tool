"""
V2 UpsellComboRepo - Storage layer for upsell combos.
Uses FBT API but with clean v2 interface.
"""

from typing import List, Optional, Dict
from datetime import datetime
from app.core.fbt_client import FBTAPIClient
from app.schemas.v2.upsell_combos import UpsellCombo


class UpsellComboRepo:
    """Repository for upsell combos storage"""
    
    def __init__(self, fbt_client: FBTAPIClient):
        self.fbt_client = fbt_client
    
    def _combo_to_dict(self, combo: UpsellCombo) -> Dict:
        """Convert UpsellCombo to FBT API format (matching desktop app)"""
        # Use first main_id as main_id for FBT API
        if not combo.main_ids:
            raise ValueError("main_ids cannot be empty")
        main_id = combo.main_ids[0]
        
        # CRITICAL: Use combo.combo_ids for bundle (from FE or WP API)
        # If combo_ids not provided, calculate from product_ids - main_ids as fallback
        combo_ids = combo.combo_ids if combo.combo_ids else []
        if not combo_ids and combo.product_ids:
            main_set = set(combo.main_ids)
            combo_ids = [pid for pid in combo.product_ids if pid not in main_set]
        
        # Ensure product_ids includes all (main_ids + combo_ids)
        product_ids = combo.product_ids if combo.product_ids else []
        if not product_ids:
            all_ids = set(combo.main_ids)
            all_ids.update(combo_ids)
            product_ids = sorted(list(all_ids))
        
        # Convert discount_rules to FBT format (matching desktop app)
        discount_rules = [
            {"min": rule.min_items, "rate": rule.rate}
            for rule in combo.discount_rules
        ]
        
        return {
            "main_id": main_id,
            "main_name": combo.name,
            "enabled": combo.enabled,
            "apply_scope": combo.apply_scope,
            "product_ids": product_ids,
            "main_ids": combo.main_ids,
            "combo_ids": combo_ids,  # CRITICAL: Use combo_ids from combo object
            "priority": combo.priority,
            "discount_rules": discount_rules,
            "updated_at": combo.updated_at or datetime.now().isoformat()
        }
    
    def _dict_to_combo(self, data: Dict) -> UpsellCombo:
        """Convert FBT API format to UpsellCombo (matching desktop app)"""
        from app.schemas.v2.upsell_combos import DiscountRuleSchema
        
        # Parse discount_rules (matching desktop app format)
        discount_rules = []
        for rule_data in data.get("discount_rules", []):
            # Handle both "min"/"min_items" and "rate" formats
            min_items = rule_data.get("min_items") or rule_data.get("min", 2)
            rate = rule_data.get("rate", 0.0)
            discount_rules.append(DiscountRuleSchema(min_items=min_items, rate=rate))
        
        # Parse timestamps (keep as strings for API compatibility)
        created_at = data.get("created_at")
        updated_at = data.get("updated_at")
        
        # Get main_ids (with migration support)
        main_ids = data.get("main_ids", [])
        if not main_ids and data.get("main_id"):
            main_ids = [data.get("main_id")]
        
        # Get combo_ids from WP API (CRITICAL: bundle items are stored here)
        combo_ids = data.get("combo_ids", [])
        
        # Get product_ids (with migration support)
        product_ids = data.get("product_ids", [])
        if not product_ids:
            # Build from main_id + combo_ids (legacy format)
            all_ids = set()
            if data.get("main_id"):
                all_ids.add(data.get("main_id"))
            all_ids.update(combo_ids)
            product_ids = sorted(list(all_ids))
        
        return UpsellCombo(
            id=data.get("main_id", 0),
            name=data.get("main_name", f"Combo #{data.get('main_id', 0)}"),
            enabled=data.get("enabled", True),
            main_ids=main_ids,
            product_ids=product_ids,
            combo_ids=combo_ids,  # CRITICAL: Store combo_ids from WP API
            discount_rules=discount_rules,
            priority=data.get("priority", 0),
            apply_scope=data.get("apply_scope", "main_only"),
            created_at=created_at,
            updated_at=updated_at
        )
    
    async def list(self, page: int = 1, page_size: int = 50, search: str = "") -> tuple[List[UpsellCombo], int]:
        """List combos with pagination"""
        success, combos_data, error = await self.fbt_client.list_combos(search, page, page_size)
        
        if not success:
            return [], 0
        
        combos = [self._dict_to_combo(c) for c in combos_data]
        
        # Estimate total (FBT API doesn't return total, so we use current page count)
        total = len(combos) if page == 1 else page * page_size
        
        return combos, total
    
    async def get(self, combo_id: int) -> Optional[UpsellCombo]:
        """Get combo by ID"""
        success, combo_data, error = await self.fbt_client.get_combo(combo_id)
        
        if not success or not combo_data:
            return None
        
        return self._dict_to_combo(combo_data)
    
    async def create(self, combo: UpsellCombo) -> UpsellCombo:
        """Create new combo"""
        combo_dict = self._combo_to_dict(combo)
        combo_dict["updated_at"] = datetime.now().isoformat()
        
        success, error = await self.fbt_client.save_combo(combo_dict)
        
        if not success:
            raise ValueError(error or "Failed to create combo")
        
        # Get the created combo
        main_id = combo_dict["main_id"]
        created = await self.get(main_id)
        if not created:
            raise ValueError("Failed to retrieve created combo")
        
        return created
    
    async def update(self, combo_id: int, combo: UpsellCombo) -> UpsellCombo:
        """Update existing combo"""
        combo.id = combo_id
        combo_dict = self._combo_to_dict(combo)
        combo_dict["updated_at"] = datetime.now().isoformat()
        
        success, error = await self.fbt_client.save_combo(combo_dict)
        
        if not success:
            raise ValueError(error or "Failed to update combo")
        
        # Get the updated combo
        updated = await self.get(combo_id)
        if not updated:
            raise ValueError("Failed to retrieve updated combo")
        
        return updated
    
    async def delete(self, combo_id: int) -> bool:
        """Delete combo"""
        success, error = await self.fbt_client.delete_combo(combo_id)
        return success

