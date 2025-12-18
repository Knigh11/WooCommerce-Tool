"""
Configuration management for the WooCommerce Backend API.
"""

import json
import os
from pathlib import Path
from typing import Dict, Optional
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings."""
    
    woo_config_path: str = Field(
        default="./woo_config.json",
        env="WOO_CONFIG_PATH"
    )
    redis_url: str = Field(
        default="redis://localhost:6379/0",
        env="REDIS_URL"
    )
    allow_image_domains: Optional[str] = Field(
        default=None,
        env="ALLOW_IMAGE_DOMAINS"
    )
    log_level: str = Field(
        default="INFO",
        env="LOG_LEVEL"
    )
    
    class Config:
        env_file = ".env"
        case_sensitive = False


_settings = Settings()


def load_stores_config(config_path: Optional[str] = None) -> Dict:
    """
    Load stores configuration from JSON file.
    
    Args:
        config_path: Optional path to config file. If None, uses WOO_CONFIG_PATH.
    
    Returns:
        Dict with 'active' and 'stores' keys.
    
    Raises:
        FileNotFoundError: If config file doesn't exist.
        ValueError: If config is invalid.
    """
    path = Path(config_path or _settings.woo_config_path)
    
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")
    
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    if not isinstance(data, dict):
        raise ValueError("Config must be a JSON object")
    
    if "stores" not in data:
        raise ValueError("Config must have 'stores' key")
    
    return data


def get_store_config(store_name: str, config_path: Optional[str] = None) -> Optional[Dict]:
    """
    Get configuration for a specific store by name.
    
    Args:
        store_name: Store display name (key in stores dict)
        config_path: Optional path to config file.
    
    Returns:
        Store config dict or None if not found.
    """
    config = load_stores_config(config_path)
    stores = config.get("stores", {})
    return stores.get(store_name)


def get_all_stores(config_path: Optional[str] = None) -> Dict[str, Dict]:
    """
    Get all stores configuration.
    
    Args:
        config_path: Optional path to config file.
    
    Returns:
        Dict mapping store names to their configs.
    """
    config = load_stores_config(config_path)
    return config.get("stores", {})


def generate_store_id(store_name: str) -> str:
    """
    Generate a stable store_id (slug) from store name.
    
    Args:
        store_name: Store display name.
    
    Returns:
        URL-safe slug.
    """
    import re
    # Convert to lowercase, replace spaces/special chars with hyphens
    slug = re.sub(r'[^\w\s-]', '', store_name.lower())
    slug = re.sub(r'[-\s]+', '-', slug)
    return slug.strip('-')


def save_stores_config(config_data: Dict, config_path: Optional[str] = None) -> None:
    """
    Save stores configuration to JSON file.
    
    Args:
        config_data: Dict with 'active' and 'stores' keys.
        config_path: Optional path to config file. If None, uses WOO_CONFIG_PATH.
    
    Raises:
        ValueError: If config is invalid.
        IOError: If file cannot be written.
    """
    if not isinstance(config_data, dict):
        raise ValueError("Config must be a JSON object")
    
    if "stores" not in config_data:
        raise ValueError("Config must have 'stores' key")
    
    path = Path(config_path or _settings.woo_config_path)
    
    # Create parent directory if it doesn't exist
    path.parent.mkdir(parents=True, exist_ok=True)
    
    # Write with pretty formatting
    with open(path, "w", encoding="utf-8") as f:
        json.dump(config_data, f, indent=2, ensure_ascii=False)


def get_active_store(config_path: Optional[str] = None) -> Optional[str]:
    """
    Get the active store name.
    
    Args:
        config_path: Optional path to config file.
    
    Returns:
        Active store name or None if not set.
    """
    config = load_stores_config(config_path)
    return config.get("active")


def set_active_store(store_name: str, config_path: Optional[str] = None) -> None:
    """
    Set the active store.
    
    Args:
        store_name: Store name to set as active.
        config_path: Optional path to config file.
    
    Raises:
        ValueError: If store doesn't exist.
    """
    config = load_stores_config(config_path)
    stores = config.get("stores", {})
    
    if store_name not in stores:
        raise ValueError(f"Store '{store_name}' not found")
    
    config["active"] = store_name
    save_stores_config(config, config_path)


def validate_store_config(config: Dict) -> tuple[bool, str]:
    """
    Validate store configuration (giống desktop app validate_config).
    
    Args:
        config: Store config dict with store_url, consumer_key, consumer_secret, etc.
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not config:
        return False, "Config không tồn tại"
    
    required_fields = ["store_url", "consumer_key", "consumer_secret"]
    
    for field in required_fields:
        if field not in config:
            return False, f"Thiếu trường bắt buộc: {field}"
        
        if not config[field] or not isinstance(config[field], str):
            return False, f"Trường {field} không hợp lệ"
    
    # Validate URL format
    store_url = config["store_url"].strip()
    if not store_url.startswith(("http://", "https://")):
        return False, "store_url phải bắt đầu bằng http:// hoặc https://"
    
    # Remove trailing slash (modify in place)
    if store_url.endswith("/"):
        config["store_url"] = store_url.rstrip("/")
    
    return True, ""


def get_settings() -> Settings:
    """Get application settings."""
    return _settings

