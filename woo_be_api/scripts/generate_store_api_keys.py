#!/usr/bin/env python3
"""
Generate API keys for stores that don't have one.
Adds api_key field to store configs in woo_config.json.
"""

import json
import secrets
import sys
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import load_stores_config, save_stores_config


def generate_api_key(length: int = 32) -> str:
    """Generate a secure random API key."""
    return secrets.token_hex(length)


def main():
    """Generate API keys for all stores missing them."""
    try:
        config = load_stores_config()
        stores = config.get("stores", {})
        
        updated = False
        for store_name, store_config in stores.items():
            if "api_key" not in store_config or not store_config.get("api_key"):
                api_key = generate_api_key()
                store_config["api_key"] = api_key
                updated = True
                print(f"Generated API key for store '{store_name}': {api_key}")
        
        if updated:
            config["stores"] = stores
            save_stores_config(config)
            print("\n✅ API keys generated and saved to config file.")
        else:
            print("✅ All stores already have API keys.")
        
    except Exception as e:
        print(f"❌ Error: {str(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

