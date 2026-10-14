try:
    import ujson  # optional dependency -> external
except ImportError:
    ujson = None


def load():
    from shop.services import pricing  # function-level import is still found

    return pricing
