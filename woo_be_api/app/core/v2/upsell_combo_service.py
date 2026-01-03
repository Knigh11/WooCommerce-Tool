"""
V2 UpsellComboService - Business logic with ProductCard expansion.
"""

from typing import List, Optional
from app.core.v2.upsell_combo_repo import UpsellComboRepo
from app.core.v2.product_card_service import ProductCardService
from app.schemas.v2.upsell_combos import (
    UpsellCombo, UpsellComboCreate, UpsellComboUpdate, UpsellComboOut
)


class UpsellComboService:
    """Service for upsell combos with ProductCard expansion"""
    
    def __init__(self, repo: UpsellComboRepo, card_service: ProductCardService):
        self.repo = repo
        self.card_service = card_service
    
    async def _expand_combo(self, combo: UpsellCombo) -> UpsellComboOut:
        """Expand combo with ProductCards"""
        # Get main products
        main_cards = await self.card_service.get_cards(combo.main_ids)
        
        # CRITICAL: Get bundle products from combo_ids (WP API stores bundle here)
        # NOT from product_ids - main_ids calculation
        bundle_cards = await self.card_service.get_cards(combo.combo_ids)
        
        return UpsellComboOut(
            **combo.model_dump(),
            main_products=main_cards,
            bundle_products=bundle_cards
        )
    
    async def list(self, page: int = 1, page_size: int = 50, search: str = "") -> tuple[List[UpsellComboOut], int]:
        """List combos with expanded cards"""
        combos, total = await self.repo.list(page, page_size, search)
        
        expanded = []
        for combo in combos:
            expanded.append(await self._expand_combo(combo))
        
        return expanded, total
    
    async def get(self, combo_id: int) -> Optional[UpsellComboOut]:
        """Get combo with expanded cards"""
        combo = await self.repo.get(combo_id)
        if not combo:
            return None
        
        return await self._expand_combo(combo)
    
    async def create(self, data: UpsellComboCreate) -> UpsellComboOut:
        """Create combo and return with expanded cards"""
        # Pydantic will automatically convert dicts to DiscountRuleSchema objects
        combo_dict = data.model_dump()
        # If combo_ids not provided, calculate from product_ids - main_ids
        if not combo_dict.get("combo_ids"):
            main_set = set(combo_dict.get("main_ids", []))
            product_ids = combo_dict.get("product_ids", [])
            combo_dict["combo_ids"] = [pid for pid in product_ids if pid not in main_set]
        
        combo = UpsellCombo(**combo_dict)
        created = await self.repo.create(combo)
        return await self._expand_combo(created)
    
    async def update(self, combo_id: int, data: UpsellComboUpdate) -> UpsellComboOut:
        """Update combo and return with expanded cards"""
        from app.schemas.v2.upsell_combos import DiscountRuleSchema
        
        # Get current combo
        current = await self.repo.get(combo_id)
        if not current:
            raise ValueError(f"Combo {combo_id} not found")
        
        # Apply partial update
        update_dict = data.model_dump(exclude_unset=True)
        for key, value in update_dict.items():
            # Special handling for discount_rules: convert dicts to DiscountRuleSchema objects
            if key == "discount_rules" and value is not None:
                if isinstance(value, list):
                    discount_rules = []
                    for rule_item in value:
                        if isinstance(rule_item, dict):
                            # Convert dict to DiscountRuleSchema
                            discount_rules.append(DiscountRuleSchema(**rule_item))
                        elif isinstance(rule_item, DiscountRuleSchema):
                            discount_rules.append(rule_item)
                        else:
                            # Already a DiscountRuleSchema object
                            discount_rules.append(rule_item)
                    setattr(current, key, discount_rules)
                else:
                    setattr(current, key, value)
            # CRITICAL: Handle combo_ids update
            elif key == "combo_ids" and value is not None:
                setattr(current, key, value)
                # Update product_ids to include main_ids + combo_ids
                all_ids = set(current.main_ids)
                all_ids.update(value)
                current.product_ids = sorted(list(all_ids))
            else:
                setattr(current, key, value)
        
        updated = await self.repo.update(combo_id, current)
        return await self._expand_combo(updated)
    
    async def delete(self, combo_id: int) -> bool:
        """Delete combo"""
        return await self.repo.delete(combo_id)

