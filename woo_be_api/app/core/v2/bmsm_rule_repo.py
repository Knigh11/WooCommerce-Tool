"""
V2 BmsmRuleRepo - Storage layer for BMSM rules.
Uses BMSM Index API for list and WooCommerce product meta for detail/update.
"""

from typing import List, Optional, Dict
import json
from app.core.woo_client import WooClient
from app.core.bmsm_client import BmsmIndexClient
from app.schemas.v2.bmsm_rules import BmsmRule, BmsmTier


class BmsmRuleRepo:
    """Repository for BMSM rules storage"""
    
    def __init__(self, woo_client: WooClient, bmsm_client: BmsmIndexClient):
        self.woo_client = woo_client
        self.bmsm_client = bmsm_client
    
    def _rule_to_meta(self, rule: BmsmRule) -> Dict:
        """Convert BmsmRule to WooCommerce product meta format"""
        # Convert tiers to BMSM format (matching WP API: {min, rate})
        rules_list = []
        for tier in rule.tiers:
            rules_list.append({
                "min": tier.min_qty,
                "rate": tier.rate  # Rate is decimal (0.05 = 5%)
            })
        
        return {
            "_bmsm_enabled": "1" if rule.enabled else "0",
            "_bmsm_rules": json.dumps(rules_list)  # Store as JSON string
        }
    
    def _meta_to_rule(self, product_id: int, product_data: Dict) -> Optional[BmsmRule]:
        """Convert WooCommerce product meta to BmsmRule"""
        meta_data = product_data.get("meta_data", [])
        meta_dict = {item.get("key"): item.get("value") for item in meta_data}
        
        # Check if BMSM is configured
        enabled_str = meta_dict.get("_bmsm_enabled", "0")
        enabled = enabled_str == "1"
        
        # Get rules
        rules_json = meta_dict.get("_bmsm_rules", "[]")
        if isinstance(rules_json, str):
            try:
                rules_list = json.loads(rules_json)
            except (json.JSONDecodeError, TypeError):
                rules_list = []
        else:
            rules_list = rules_json if isinstance(rules_json, list) else []
        
        # Convert to tiers (matching WP API format: {min, rate})
        tiers = []
        for rule_dict in rules_list:
            if isinstance(rule_dict, dict):
                min_qty = rule_dict.get("min", 2)
                rate = rule_dict.get("rate", 0.0)
                # Validate and sanitize
                if min_qty >= 2 and 0 < rate <= 0.95:
                    tiers.append(BmsmTier(
                        min_qty=min_qty,
                        rate=rate
                    ))
        
        return BmsmRule(
            id=product_id,
            enabled=enabled,
            tiers=tiers
        )
    
    async def list(self, page: int = 1, page_size: int = 50, search: str = "", filter_type: str = "all") -> tuple[List[tuple[BmsmRule, dict]], int]:
        """List rules using BMSM Index API, returns (rule, stats) tuples"""
        try:
            # Call BMSM Index API
            success, items, total, error = await self.bmsm_client.get_index(
                page=page,
                per_page=page_size,
                search=search,
                filter_type=filter_type
            )
            
            if not success:
                return [], 0
            
            # Convert index items to BmsmRule with stats
            rules_with_stats = []
            for item in items:
                product_id = item.get("id", 0)
                if product_id:
                    # Create minimal rule from index data
                    rule = BmsmRule(
                        id=product_id,
                        enabled=item.get("enabled", False),
                        tiers=[]  # Will be loaded in detail endpoint
                    )
                    # Extract stats from index item
                    stats = {
                        "tier_count": item.get("tier_count", 0),
                        "max_rate": item.get("max_rate") or item.get("max_percent"),  # Handle both field names
                        "min_qty_min": item.get("min_qty_min"),
                        "min_qty_max": item.get("min_qty_max"),
                        "status": item.get("status")
                    }
                    # Convert max_percent to rate if needed
                    if stats["max_rate"] and stats["max_rate"] > 1:
                        stats["max_rate"] = stats["max_rate"] / 100.0
                    rules_with_stats.append((rule, stats))
            
            return rules_with_stats, total
        except Exception as e:
            return [], 0
    
    async def get(self, rule_id: int) -> Optional[BmsmRule]:
        """Get rule by ID (product ID) - fetches from WooCommerce product meta"""
        try:
            # Fetch product with meta_data
            product = await self.woo_client.get_product(rule_id)
            if not product:
                return None
            
            return self._meta_to_rule(rule_id, product)
        except Exception:
            return None
    
    async def create(self, rule: BmsmRule) -> BmsmRule:
        """Create new rule (requires product_id as rule.id)"""
        if not rule.id:
            raise ValueError("rule.id (product_id) is required for create")
        
        return await self.update(rule.id, rule)
    
    async def update(self, rule_id: int, rule: BmsmRule) -> BmsmRule:
        """Update existing rule"""
        rule.id = rule_id
        
        try:
            # Get current product
            product = await self.woo_client.get_product(rule_id)
            if not product:
                raise ValueError(f"Product {rule_id} not found")
            
            # Update meta
            meta_updates = self._rule_to_meta(rule)
            
            # Update product meta_data - properly merge existing meta
            meta_data = product.get("meta_data", [])
            if not isinstance(meta_data, list):
                meta_data = []
            
            meta_dict = {}
            for item in meta_data:
                if isinstance(item, dict):
                    key = item.get("key")
                    if key:
                        meta_dict[key] = item.copy()
            
            # Update or add meta entries
            for key, value in meta_updates.items():
                if key in meta_dict:
                    meta_dict[key]["value"] = value
                else:
                    meta_dict[key] = {"key": key, "value": value}
            
            # Rebuild meta_data list (only send meta_data, not full product)
            update_payload = {
                "meta_data": list(meta_dict.values())
            }
            
            # Save product via WooCommerce API (only send meta_data)
            try:
                updated = await self.woo_client.update_product(rule_id, update_payload)
                if not updated:
                    raise ValueError("WooCommerce API returned empty response")
            except Exception as e:
                raise ValueError(f"WooCommerce API error: {str(e)}")
            
            # Get updated rule to verify
            updated_rule = await self.get(rule_id)
            if not updated_rule:
                raise ValueError("Failed to retrieve updated rule after save")
            
            return updated_rule
        except ValueError:
            raise
        except Exception as e:
            raise ValueError(f"Error updating BMSM rule: {str(e)}")
    
    async def delete(self, rule_id: int) -> bool:
        """Delete rule (clear BMSM meta)"""
        try:
            product = await self.woo_client.get_product(rule_id)
            if not product:
                return False
            
            # Clear BMSM meta
            meta_data = product.get("meta_data", [])
            meta_data = [item for item in meta_data if not item.get("key", "").startswith("_bmsm_")]
            
            product["meta_data"] = meta_data
            await self.woo_client.update_product(rule_id, product)
            
            return True
        except Exception:
            return False
