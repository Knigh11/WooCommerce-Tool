"""
Category tree utilities for WooCommerce categories.
Copied from desktop app and adapted for backend use.
"""

from dataclasses import dataclass, field
from typing import List, Dict


@dataclass
class CategoryNode:
    """
    Represents a category in the tree structure.
    
    Attributes:
        id: WooCommerce category ID
        name: Category name
        parent: Parent category ID (0 for root)
        count: Number of products in this category
        children: List of child CategoryNode objects
        level: Depth level (0 = root, 1 = first child, etc.)
        full_path: Full path like "Parent / Child / Grandchild"
        image_id: Category image attachment ID (optional)
        image_src: Category image URL (optional)
        slug: Category slug
        description: Category description
    """
    id: int
    name: str
    parent: int
    count: int = 0
    children: List["CategoryNode"] = field(default_factory=list)
    level: int = 0
    full_path: str = ""
    image_id: int = None
    image_src: str = None
    slug: str = ""
    description: str = ""
    
    def __repr__(self):
        return f"CategoryNode(id={self.id}, name='{self.name}', level={self.level})"


def build_category_tree(raw_categories: List[Dict]) -> List[CategoryNode]:
    """
    Build a hierarchical tree structure from flat category data.
    
    Args:
        raw_categories: List of category dicts from WooCommerce API.
                       Each dict should have: id, name, parent
    
    Returns:
        List of root CategoryNode objects (parent == 0), with children populated
        and level/full_path set correctly.
    """
    if not raw_categories:
        return []
    
    # Create lookup dictionary for fast access
    nodes_by_id: Dict[int, CategoryNode] = {}
    
    # First pass: Create all nodes
    for cat in raw_categories:
        # Extract image data - handle cases where image is False, None, or invalid
        image_value = cat.get("image")
        image_id = None
        image_src = None
        
        if isinstance(image_value, dict) and image_value:
            # Valid image dict
            image_id = image_value.get("id")
            image_src = image_value.get("src")
            # Ensure image_src is string or None, never boolean
            if image_src is not None and not isinstance(image_src, str):
                image_src = str(image_src) if image_src else None
        elif image_value is False or image_value is None:
            # No image - already set to None
            pass
        else:
            # Invalid type - ignore
            pass
        
        # Ensure image_src is None or string (never boolean or other types)
        if image_src is not None and not isinstance(image_src, str):
            image_src = None
        
        node = CategoryNode(
            id=cat.get("id", 0),
            name=cat.get("name", "Unknown"),
            parent=cat.get("parent", 0),
            count=cat.get("count", 0),  # Product count from API
            image_id=image_id,
            image_src=image_src,
            slug=cat.get("slug", ""),
            description=cat.get("description", ""),
        )
        nodes_by_id[node.id] = node
    
    # Second pass: Build parent-child relationships
    roots: List[CategoryNode] = []
    
    for node in nodes_by_id.values():
        if node.parent == 0:
            # Root category
            roots.append(node)
        else:
            # Child category - attach to parent
            parent_node = nodes_by_id.get(node.parent)
            if parent_node:
                parent_node.children.append(node)
            else:
                # Parent not found, treat as root
                roots.append(node)
    
    # Third pass: Set level and full_path for all nodes
    def set_hierarchy_info(node: CategoryNode, level: int = 0, path_prefix: str = ""):
        node.level = level
        node.full_path = f"{path_prefix}{node.name}".strip()
        
        # Recursively process children
        for child in node.children:
            child_prefix = f"{node.full_path} / "
            set_hierarchy_info(child, level + 1, child_prefix)
    
    for root in roots:
        set_hierarchy_info(root)
    
    # Sort roots and children by name for better UX
    def sort_children(node: CategoryNode):
        node.children.sort(key=lambda n: n.name.lower())
        for child in node.children:
            sort_children(child)
    
    roots.sort(key=lambda n: n.name.lower())
    for root in roots:
        sort_children(root)
    
    return roots


def flatten_tree_for_display(roots: List[CategoryNode]) -> List[CategoryNode]:
    """
    Flatten a category tree into a depth-first ordered list.
    
    This is suitable for display in a listbox with indentation.
    
    Args:
        roots: List of root CategoryNode objects
    
    Returns:
        Flat list of all CategoryNode objects in depth-first order
    """
    result: List[CategoryNode] = []
    
    def traverse(node: CategoryNode):
        result.append(node)
        for child in node.children:
            traverse(child)
    
    for root in roots:
        traverse(root)
    
    return result


def search_categories(nodes: List[CategoryNode], query: str) -> List[CategoryNode]:
    """
    Search categories by name or full path (case-insensitive).
    
    Args:
        nodes: List of CategoryNode objects to search
        query: Search query string
    
    Returns:
        Filtered list of CategoryNode objects matching the query
    """
    if not query or not query.strip():
        return nodes
    
    q = query.strip().lower()
    
    # Match on name or full_path
    return [
        node for node in nodes
        if q in node.name.lower() or q in node.full_path.lower()
    ]

