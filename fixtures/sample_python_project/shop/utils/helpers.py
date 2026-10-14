import json


def format_money(value: object) -> str:
    return json.dumps(str(value))
