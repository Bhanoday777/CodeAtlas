from dataclasses import dataclass

from shop.utils import helpers


@dataclass
class Order:
    order_id: int
    total: object

    def label(self) -> str:
        return helpers.format_money(self.total)
