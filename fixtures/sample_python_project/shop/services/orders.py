from . import pricing
from ..models import order
from ..models.order import Order  # same target as the line above -> one edge


def place_order(order_id: int) -> Order:
    return order.Order(order_id, pricing.price_for(order_id))
