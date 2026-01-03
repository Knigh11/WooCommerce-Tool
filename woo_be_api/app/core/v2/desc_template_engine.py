"""
Template engine for rendering product descriptions with placeholders.
Adapted from desktop module.
"""

import re
from typing import Dict, List, Optional, Any
from dataclasses import dataclass


@dataclass
class AnchorRules:
    """Rules for injecting anchor keywords."""
    keywords: List[str]  # List of anchor keywords
    append_to_keywords: bool = True  # Add to keywords placeholder
    append_as_bullet: bool = False  # Add as extra bullet point
    append_at_end: bool = False  # Append at end of description


class TemplateEngine:
    """Renders templates with placeholders and anchor keyword injection."""

    # Default template
    DEFAULT_TEMPLATE = """{{title}} is a premium {{product_type}} from Equineop Store designed for {{use}}. 
This {{fit}} piece blends comfort, style and all over print artwork so you can stand out in any outfit.

{{title}} – {{main_keyword}} | {{extra_keywords}}

Product details:

- Each apparel product from Equineop Store is constructed from Premium Woven Polyester that is ultra-soft and incredibly comfortable.
- They feature a specialty high-definition heat-dye application that ensures long-lasting color vibrancy even after machine washing.
- Fabric is durable and resistant to wrinkles, shrinking, and mildew.
- Each product is custom printed, cut, and sewn just for you - there may be small differences in the design on the seams and/or arms due to the custom nature of the production process.

Why you'll love it:
- Perfect for {{use}}.
- Easy to style with your favorite streetwear basics.
- Ideal for fans of exclusive all over print designs.
{{anchor_bullets}}

Disclaimer:

Due to the nature of the cut and sew/sublimation process, each product may look a little different but they are all handmade with love!

Decoration type: All Over Print.
{{anchor_end}}"""

    def __init__(self, template: Optional[str] = None):
        self.template = template or self.DEFAULT_TEMPLATE

    def deduplicate_keywords(self, keywords: List[str], case_sensitive: bool = False) -> List[str]:
        """Deduplicate keywords (case-insensitive by default)."""
        seen = set()
        result = []
        for kw in keywords:
            key = kw if case_sensitive else kw.lower()
            if key not in seen:
                seen.add(key)
                result.append(kw)
        return result

    def build_context(
        self,
        title: str,
        category_folder: str,
        preset: Dict[str, Any],
        anchor_rules: Optional[AnchorRules] = None
    ) -> Dict[str, str]:
        """
        Build context dictionary for template rendering.
        
        Available placeholders:
        - {{title}}
        - {{category}}
        - {{product_type}}
        - {{fit}}
        - {{use}}
        - {{keywords}} (comma-separated, includes anchors if append_to_keywords=True)
        - {{main_keyword}} (first keyword)
        - {{extra_keywords}} (remaining keywords, comma-separated)
        - {{anchor_bullets}} (anchor keywords as bullets)
        - {{anchor_end}} (anchor keywords appended at end)
        """
        # Extract preset data
        product_type = preset.get("product_type", "")
        fit = preset.get("fit", "")
        use = preset.get("use", "")
        
        # Get keywords (handle both list and string formats)
        seo_keywords = preset.get("seo_keywords", [])
        if isinstance(seo_keywords, str):
            keywords = [k.strip() for k in seo_keywords.split(',') if k.strip()]
        elif isinstance(seo_keywords, list):
            keywords = [str(k).strip() for k in seo_keywords if k and str(k).strip()]
        else:
            keywords = []
        
        # Process anchors
        anchor_bullets = ""
        anchor_end = ""
        anchor_keywords = []
        
        if anchor_rules and anchor_rules.keywords:
            # Deduplicate anchors
            anchors = self.deduplicate_keywords(anchor_rules.keywords)
            
            if anchor_rules.append_to_keywords:
                # Add to keywords list (deduplicated against existing)
                existing_lower = {k.lower() for k in keywords}
                for anchor in anchors:
                    if anchor.lower() not in existing_lower:
                        anchor_keywords.append(anchor)
                        keywords.append(anchor)
            
            if anchor_rules.append_as_bullet:
                # Format as bullet points
                bullet_lines = [f"- {anchor}" for anchor in anchors]
                anchor_bullets = "\n".join(bullet_lines)
            
            if anchor_rules.append_at_end:
                # Append at end
                anchor_end = "\n\n" + ", ".join(anchors)

        # Build keywords strings
        main_keyword = keywords[0] if keywords else ""
        extra_keywords = ", ".join(keywords[1:]) if len(keywords) > 1 else ""
        keywords_str = ", ".join(keywords)

        return {
            "title": title,
            "category": category_folder or "",
            "product_type": product_type,
            "fit": fit,
            "use": use,
            "keywords": keywords_str,
            "main_keyword": main_keyword,
            "extra_keywords": extra_keywords,
            "anchor_bullets": anchor_bullets,
            "anchor_end": anchor_end,
        }

    def render_template(self, template_str: str, context: Dict[str, str]) -> str:
        """
        Render template with placeholders.
        Missing keys are replaced with empty string (safe).
        """
        result = template_str
        
        # Replace all placeholders {{key}}
        pattern = r'\{\{(\w+)\}\}'
        
        def replace_placeholder(match):
            key = match.group(1)
            return context.get(key, "")
        
        result = re.sub(pattern, replace_placeholder, result)
        
        # Clean up extra newlines (max 2 consecutive)
        result = re.sub(r'\n{3,}', '\n\n', result)
        
        return result.strip()

    def render(
        self,
        title: str,
        category_folder: str,
        preset: Dict[str, Any],
        anchor_rules: Optional[AnchorRules] = None,
        template: Optional[str] = None
    ) -> str:
        """Render description using current template or provided template."""
        template_str = template or self.template
        context = self.build_context(title, category_folder, preset, anchor_rules)
        return self.render_template(template_str, context)

