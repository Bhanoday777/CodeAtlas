from decimal import Decimal

from shop.models.order import Order
from shop.utils.helpers import format_money


def price_for(order_id: int) -> Decimal:
    return Decimal(order_id)


def describe(o: Order) -> str:
    return format_money(o.total)
