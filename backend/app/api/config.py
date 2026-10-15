"""Which repository the API analyzes.

CODEATLAS_REPO set     -> that path; startup fails if it is not a directory.
CODEATLAS_REPO not set -> the controlled fixture repository.

An explicitly configured but invalid path never falls back to the fixture:
the API would otherwise serve the wrong repository without anyone noticing.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path

ENV_VAR = "CODEATLAS_REPO"
FIXTURE_REPO = Path(__file__).resolve().parents[3] / "fixtures" / "sample_python_project"


class RepositoryConfigError(RuntimeError):
    """The configured repository path cannot be analyzed."""


def resolve_repo_path(env: Mapping[str, str] | None = None) -> Path:
    """Return the absolute, normalized repository root to analyze."""
    env = os.environ if env is None else env
    raw = env.get(ENV_VAR)
    if raw is None:
        return validate_repo_path(FIXTURE_REPO)
    if not raw.strip():
        raise RepositoryConfigError(f"{ENV_VAR} is set but empty")
    return validate_repo_path(Path(raw.strip()))


def validate_repo_path(path: Path) -> Path:
    resolved = Path(path).expanduser().resolve()
    if not resolved.is_dir():
        raise RepositoryConfigError(
            f"Repository path {str(path)!r} (resolved to {resolved}) is not an existing directory"
        )
    return resolved
