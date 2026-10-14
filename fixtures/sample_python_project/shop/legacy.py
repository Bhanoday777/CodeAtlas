import shop.missing_module  # local package, missing module -> unresolved
from shop.utils import does_not_exist  # not a submodule -> assumed name in shop.utils
from .gone import thing  # relative, no such module -> unresolved
