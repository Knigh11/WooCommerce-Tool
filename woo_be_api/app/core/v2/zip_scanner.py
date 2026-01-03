"""
ZIP scanner for description builder - scans ZIP without extracting.
Detects root folder, finds leaf directories, and sanitizes paths.
"""

import zipfile
import hashlib
from pathlib import Path
from typing import List, Optional, Dict, Set, Tuple
from dataclasses import dataclass


@dataclass
class ZipLeafItem:
    """Leaf folder item from ZIP."""
    id: str  # Stable hash of rel_path
    rel_path: str  # Relative path (no leading /)
    title: str  # Folder name
    category: Optional[str]  # Parent folder category
    has_description: bool  # Whether description.txt exists in ZIP


class ZipWorkspaceScanner:
    """Scans ZIP file for leaf directories without extracting."""
    
    # System files to ignore
    IGNORE_PATTERNS = {
        '.DS_Store', 'Thumbs.db', 'desktop.ini', '.git', '.gitignore',
        '__MACOSX', '.svn', '.idea', '.vscode'
    }
    
    # Image extensions (for leaf detection, but we don't process them)
    IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'}
    
    def __init__(self, zip_path: str):
        """
        Initialize scanner.
        
        Args:
            zip_path: Path to ZIP file
        """
        self.zip_path = zip_path
    
    def _sanitize_path(self, path: str) -> Optional[str]:
        """
        Sanitize and normalize path.
        Rejects zip-slip attacks and invalid paths.
        
        Returns:
            Normalized path or None if invalid
        """
        # Normalize separators to /
        path = path.replace('\\', '/')
        
        # Remove leading/trailing slashes
        path = path.strip('/')
        
        # Reject absolute paths
        if path.startswith('/') or ':' in path.split('/')[0]:
            return None
        
        # Reject zip-slip (..)
        if '..' in path.split('/'):
            return None
        
        # Reject Windows drive patterns (C:, D:, etc.)
        if len(path) >= 2 and path[1] == ':':
            return None
        
        return path
    
    def _is_system_file(self, name: str) -> bool:
        """Check if file is a system file to ignore."""
        name_lower = name.lower()
        # Check exact match
        if name_lower in self.IGNORE_PATTERNS:
            return True
        # Check if starts with system pattern
        for pattern in self.IGNORE_PATTERNS:
            if name_lower.startswith(pattern + '/'):
                return True
        return False
    
    def _is_image_file(self, name: str) -> bool:
        """Check if file is an image (for leaf detection)."""
        ext = Path(name).suffix.lower()
        return ext in self.IMAGE_EXTENSIONS
    
    def _detect_root_name(self, all_paths: List[str]) -> Tuple[Optional[str], bool]:
        """
        Detect root folder name from ZIP paths.
        
        Returns:
            (root_name, multiple_roots)
            - root_name: Single root folder name if all paths share same first segment, else None
            - multiple_roots: True if multiple root folders detected
        """
        if not all_paths:
            return None, False
        
        # Get first segment of each path
        first_segments = set()
        for path in all_paths:
            parts = path.split('/')
            if parts and parts[0]:
                first_segments.add(parts[0])
        
        if len(first_segments) == 1:
            return list(first_segments)[0], False
        else:
            return None, True
    
    def _get_category_from_path(self, rel_path: str, root_name: Optional[str]) -> Optional[str]:
        """
        Get category folder name from relative path.
        Category is the first-level folder after root.
        """
        parts = rel_path.split('/')
        
        # Remove root if present
        if root_name and parts and parts[0] == root_name:
            parts = parts[1:]
        
        # Category is first part (if exists)
        if len(parts) > 1:
            return parts[0]
        elif len(parts) == 1:
            # Single level - use root name as category
            return root_name
        else:
            return None
    
    def _hash_path(self, path: str) -> str:
        """Generate stable hash for path (for ID)."""
        return hashlib.md5(path.encode('utf-8')).hexdigest()[:16]
    
    def scan(self) -> Tuple[Optional[str], bool, List[ZipLeafItem], Dict[str, int]]:
        """
        Scan ZIP for leaf directories.
        
        Returns:
            (root_name, multiple_roots, items, summary)
        """
        items: List[ZipLeafItem] = []
        folder_files: Dict[str, Set[str]] = {}  # folder_path -> set of file names
        all_paths: List[str] = []
        
        try:
            with zipfile.ZipFile(self.zip_path, 'r') as zf:
                # Scan all entries
                for entry_info in zf.infolist():
                    # Skip directories (they end with /)
                    if entry_info.filename.endswith('/'):
                        continue
                    
                    # Sanitize path
                    sanitized = self._sanitize_path(entry_info.filename)
                    if not sanitized:
                        continue  # Skip invalid paths
                    
                    # Skip system files
                    if self._is_system_file(sanitized):
                        continue
                    
                    all_paths.append(sanitized)
                    
                    # Get folder path (parent directory)
                    parts = sanitized.split('/')
                    if len(parts) > 1:
                        folder_path = '/'.join(parts[:-1])
                    else:
                        folder_path = ''  # Root level
                    
                    # Track files in this folder
                    if folder_path not in folder_files:
                        folder_files[folder_path] = set()
                    folder_files[folder_path].add(parts[-1])
                
                # Detect root
                root_name, multiple_roots = self._detect_root_name(all_paths)
                
                # Find leaf folders (folders with no subfolders)
                # A leaf folder is one that contains files but has no subfolders
                leaf_folders: Set[str] = set()
                
                for folder_path in folder_files.keys():
                    # Check if this folder has any subfolders
                    has_subfolders = False
                    folder_prefix = folder_path + '/' if folder_path else ''
                    
                    for other_folder in folder_files.keys():
                        if other_folder != folder_path and other_folder.startswith(folder_prefix):
                            # Check if it's a direct child (not grandchild)
                            remaining = other_folder[len(folder_prefix):] if folder_prefix else other_folder
                            if '/' not in remaining:
                                has_subfolders = True
                                break
                    
                    # If no subfolders and has files, it's a leaf
                    if not has_subfolders and folder_files[folder_path]:
                        leaf_folders.add(folder_path)
                
                # Build items
                for folder_path in sorted(leaf_folders):
                    # Get relative path (remove root if present)
                    rel_path = folder_path
                    if root_name and folder_path.startswith(root_name + '/'):
                        rel_path = folder_path[len(root_name) + 1:]
                    elif root_name and folder_path == root_name:
                        rel_path = ''
                    
                    # Get title (folder name)
                    if rel_path:
                        title = rel_path.split('/')[-1]
                    else:
                        title = root_name or 'root'
                    
                    # Get category
                    category = self._get_category_from_path(folder_path, root_name)
                    
                    # Check for description.txt
                    desc_filename = 'description.txt'
                    has_description = desc_filename in folder_files[folder_path]
                    
                    # Generate ID
                    item_id = self._hash_path(rel_path)
                    
                    items.append(ZipLeafItem(
                        id=item_id,
                        rel_path=rel_path,
                        title=title,
                        category=category,
                        has_description=has_description
                    ))
                
                # Summary
                summary = {
                    "leaf_count": len(items),
                    "with_description": sum(1 for item in items if item.has_description),
                    "without_description": sum(1 for item in items if not item.has_description)
                }
                
                return root_name, multiple_roots, items, summary
                
        except zipfile.BadZipFile:
            raise ValueError("Invalid ZIP file")
        except Exception as e:
            raise ValueError(f"Error scanning ZIP: {str(e)}")

