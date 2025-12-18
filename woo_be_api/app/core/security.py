"""
Security utilities - never log or return secrets.
"""

import re
from typing import Any, Dict


def sanitize_dict_for_logging(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Remove sensitive fields from dict for logging.
    
    Args:
        data: Dictionary that may contain secrets.
    
    Returns:
        Sanitized dictionary with secrets replaced.
    """
    sensitive_keys = [
        'consumer_secret',
        'wp_app_password',
        'password',
        'secret',
        'token',
        'api_key',
    ]
    
    result = data.copy()
    for key in sensitive_keys:
        if key in result:
            result[key] = '***REDACTED***'
    
    # Also check nested dicts
    for k, v in result.items():
        if isinstance(v, dict):
            result[k] = sanitize_dict_for_logging(v)
        elif isinstance(v, list):
            result[k] = [
                sanitize_dict_for_logging(item) if isinstance(item, dict) else item
                for item in v
            ]
    
    return result


def sanitize_string_for_logging(text: str) -> str:
    """
    Remove potential secrets from string (consumer keys, passwords, etc.).
    
    Args:
        text: String that may contain secrets.
    
    Returns:
        Sanitized string.
    """
    if not text:
        return text
    
    # Pattern for WooCommerce consumer keys/secrets
    patterns = [
        (r'ck_[a-zA-Z0-9]{32,}', 'ck_***'),
        (r'cs_[a-zA-Z0-9]{32,}', 'cs_***'),
        (r'wp_app_password["\']?\s*[:=]\s*["\']?([^"\']+)', r'wp_app_password="***"'),
    ]
    
    result = text
    for pattern, replacement in patterns:
        result = re.sub(pattern, replacement, result)
    
    return result


def filter_secrets_from_response(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Remove secrets from API response data.
    
    Args:
        data: Response data dictionary.
    
    Returns:
        Filtered dictionary without secrets.
    """
    result = data.copy()
    
    # Remove known secret fields
    result.pop('consumer_secret', None)
    result.pop('wp_app_password', None)
    
    # Recursively filter nested structures
    if isinstance(result, dict):
        for key, value in list(result.items()):
            if isinstance(value, dict):
                result[key] = filter_secrets_from_response(value)
            elif isinstance(value, list):
                result[key] = [
                    filter_secrets_from_response(item) if isinstance(item, dict) else item
                    for item in value
                ]
    
    return result

