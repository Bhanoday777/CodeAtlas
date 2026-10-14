# "." inside a package's __init__ refers to the package itself (shop.services)
from .orders import place_order

__all__ = ["place_order"]
