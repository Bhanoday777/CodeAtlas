"""Application entry point."""
import os
import requests

import shop.services.orders
from shop.utils import helpers  # helpers is a submodule -> edge to shop.utils.helpers


def run() -> None:
    print(os.getcwd(), requests, shop.services.orders, helpers)
