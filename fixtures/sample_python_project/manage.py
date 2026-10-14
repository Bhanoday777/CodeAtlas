"""Root-level script (not inside a package)."""
from shop.main import run  # run is a name inside shop.main -> edge to shop.main
from . import settings  # relative import from a top-level module -> unresolved

run()
