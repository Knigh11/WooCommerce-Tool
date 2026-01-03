"""
V2 BmsmRuleService - Business logic with ProductCard expansion.
"""

from typing import List, Optional
from app.core.v2.bmsm_rule_repo import BmsmRuleRepo
from app.core.v2.product_card_service import ProductCardService
from app.schemas.v2.bmsm_rules import (
    BmsmRule, BmsmRuleCreate, BmsmRuleUpdate, BmsmRuleOut
)
from app.schemas.v2.products import ProductCard


class BmsmRuleService:
    """Service for BMSM rules with ProductCard expansion"""
    
    def __init__(self, repo: BmsmRuleRepo, card_service: ProductCardService):
        self.repo = repo
        self.card_service = card_service
    
    async def _expand_rule(self, rule: BmsmRule, stats: Optional[dict] = None) -> BmsmRuleOut:
        """Expand rule with ProductCard for the product"""
        # Get product card for the rule's product
        product_cards = await self.card_service.get_cards([rule.id])
        product_card = product_cards[0] if product_cards else ProductCard(
            id=rule.id,
            title=f"Product #{rule.id} (not found)",
            image_url=None,
            type=None,
            sku=None,
            price=None
        )
        
        return BmsmRuleOut(
            **rule.model_dump(),
            product=product_card,
            stats=stats
        )
    
    async def list(self, page: int = 1, page_size: int = 50, search: str = "", filter_type: str = "all") -> tuple[List[BmsmRuleOut], int]:
        """List rules with expanded product cards"""
        rules_with_stats, total = await self.repo.list(page, page_size, search, filter_type)
        
        # Hydrate product cards in batch (avoid N+1)
        product_ids = [rule.id for rule, _ in rules_with_stats]
        product_cards = await self.card_service.get_cards(product_ids)
        cards_map = {card.id: card for card in product_cards}
        
        # Build expanded rules with stats from index API
        expanded = []
        for rule, stats in rules_with_stats:
            product_card = cards_map.get(rule.id)
            if not product_card:
                product_card = ProductCard(
                    id=rule.id,
                    title=f"Product #{rule.id} (not found)",
                    image_url=None,
                    type=None,
                    sku=None,
                    price=None
                )
            
            expanded.append(BmsmRuleOut(
                **rule.model_dump(),
                product=product_card,
                stats=stats
            ))
        
        return expanded, total
    
    async def get(self, rule_id: int) -> Optional[BmsmRuleOut]:
        """Get rule with expanded product card"""
        rule = await self.repo.get(rule_id)
        if not rule:
            return None
        
        # Get product card
        product_cards = await self.card_service.get_cards([rule_id])
        product_card = product_cards[0] if product_cards else ProductCard(
            id=rule_id,
            title=f"Product #{rule_id} (not found)",
            image_url=None,
            type=None,
            sku=None,
            price=None
        )
        
        # Create stats from rule
        stats = {
            "tier_count": len(rule.tiers),
            "max_rate": max([t.rate for t in rule.tiers], default=None) if rule.tiers else None,
            "min_qty_min": min([t.min_qty for t in rule.tiers], default=None) if rule.tiers else None,
            "min_qty_max": max([t.min_qty for t in rule.tiers], default=None) if rule.tiers else None
        }
        
        return BmsmRuleOut(
            **rule.model_dump(),
            product=product_card,
            stats=stats
        )
    
    async def create(self, data: BmsmRuleCreate) -> BmsmRuleOut:
        """Create rule and return with expanded product card"""
        rule = BmsmRule(**data.model_dump())
        created = await self.repo.create(rule)
        return await self._expand_rule(created)
    
    async def update(self, rule_id: int, data: BmsmRuleUpdate) -> BmsmRuleOut:
        """Update rule and return with expanded product card"""
        # Get current rule
        current = await self.repo.get(rule_id)
        if not current:
            raise ValueError(f"Rule {rule_id} not found")
        
        # Apply partial update
        update_dict = data.model_dump(exclude_unset=True)
        for key, value in update_dict.items():
            if key == "tiers" and value is not None:
                # Convert dicts to BmsmTier objects if needed
                from app.schemas.v2.bmsm_rules import BmsmTier
                if isinstance(value, list):
                    tiers = []
                    for tier_item in value:
                        if isinstance(tier_item, dict):
                            tiers.append(BmsmTier(**tier_item))
                        else:
                            tiers.append(tier_item)
                    setattr(current, key, tiers)
                else:
                    setattr(current, key, value)
            else:
                setattr(current, key, value)
        
        updated = await self.repo.update(rule_id, current)
        return await self._expand_rule(updated)
    
    async def delete(self, rule_id: int) -> bool:
        """Delete rule"""
        return await self.repo.delete(rule_id)
