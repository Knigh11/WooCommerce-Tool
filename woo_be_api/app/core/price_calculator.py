"""
Price calculation utilities for WooCommerce products.
Copied from desktop app and adapted for backend use.
"""
from typing import Literal, Optional


def calculate_new_price(
    current_price: float,
    adjustment_type: Literal["increase", "decrease"],
    adjustment_mode: Literal["amount", "percent"],
    adjustment_value: float
) -> float:
    """
    Calculate new price based on current price and adjustment parameters.
    
    Args:
        current_price: Current price
        adjustment_type: "increase" (raise) or "decrease" (lower)
        adjustment_mode: "amount" (fixed amount) or "percent" (percentage)
        adjustment_value: Adjustment value (amount or percentage)
    
    Returns:
        New price (always >= 0)
    """
    if current_price <= 0:
        return 0.0
    
    if adjustment_mode == "amount":
        # Adjust by fixed amount
        if adjustment_type == "increase":
            new_price = current_price + adjustment_value
        else:  # decrease
            new_price = current_price - adjustment_value
    else:  # percent
        # Adjust by percentage
        if adjustment_type == "increase":
            new_price = current_price * (1 + adjustment_value / 100)
        else:  # decrease
            new_price = current_price * (1 - adjustment_value / 100)
    
    # Ensure price is not negative
    new_price = max(0.0, new_price)
    
    # Round to 2 decimal places
    return round(new_price, 2)


def calculate_product_prices(
    regular_price: Optional[float],
    sale_price: Optional[float],
    adjustment_type: Literal["increase", "decrease"],
    adjustment_mode: Literal["amount", "percent"],
    adjustment_value: float
) -> tuple[Optional[float], Optional[float]]:
    """
    Calculate new prices for both regular_price and sale_price.
    
    Returns:
        (new_regular_price, new_sale_price)
    """
    new_regular = None
    new_sale = None
    
    if regular_price is not None and regular_price != "":
        try:
            regular_float = float(regular_price) if isinstance(regular_price, str) else regular_price
            if regular_float > 0:
                new_regular = calculate_new_price(
                    regular_float, adjustment_type, adjustment_mode, adjustment_value
                )
        except (ValueError, TypeError):
            pass
    
    if sale_price is not None and sale_price != "":
        try:
            sale_float = float(sale_price) if isinstance(sale_price, str) else sale_price
            if sale_float > 0:
                new_sale = calculate_new_price(
                    sale_float, adjustment_type, adjustment_mode, adjustment_value
                )
        except (ValueError, TypeError):
            pass
    
    return new_regular, new_sale

