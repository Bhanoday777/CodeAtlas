"""Run every CodeAtlas check and print one pass/fail summary.

    python scripts/check_all.py              # everything
    python scripts/check_all.py --skip-e2e   # without the browser tests

Steps: backend pytest (unit, API, contract, integration, scale), frontend lint,
typecheck + production build, Vitest (unit + contract), and Playwright e2e.
Every step runs even if an earlier one fails, so one run shows all failures.
Exit status is non-zero if any step failed.

Requirements: backend/.venv with backend/requirements.txt installed, and
`npm install` in frontend/ (see README, Quick start).
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"


def venv_python() -> str:
    for candidate in (BACKEND / ".venv" / "Scripts" / "python.exe", BACKEND / ".venv" / "bin" / "python"):
        if candidate.exists():
            return str(candidate)
    sys.exit("backend/.venv not found: create it and install backend/requirements.txt first (README, Quick start).")


def npm() -> str:
    found = shutil.which("npm")
    if found is None:
        sys.exit("npm not found on PATH: install Node.js 22.12+ or 24+ first.")
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--skip-e2e", action="store_true", help="skip the Playwright browser tests")
    args = parser.parse_args()

    python, npm_cmd = venv_python(), npm()
    steps: list[tuple[str, list[str], Path]] = [
        ("backend tests (pytest)", [python, "-m", "pytest"], BACKEND),
        ("frontend lint (oxlint)", [npm_cmd, "run", "lint"], FRONTEND),
        ("frontend typecheck + build", [npm_cmd, "run", "build"], FRONTEND),
        ("frontend tests (Vitest)", [npm_cmd, "test"], FRONTEND),
    ]
    if not args.skip_e2e:
        steps.append(("browser e2e (Playwright)", [npm_cmd, "run", "test:e2e"], FRONTEND))

    # The e2e config pins the backend to the fixture; keep other steps independent of the shell too.
    env = {key: value for key, value in os.environ.items() if key != "CODEATLAS_REPO"}
    results: list[tuple[str, bool, float]] = []
    for name, command, cwd in steps:
        print(f"\n=== {name} ===", flush=True)
        start = time.perf_counter()
        ok = subprocess.run(command, cwd=cwd, env=env).returncode == 0
        results.append((name, ok, time.perf_counter() - start))

    print("\n=== summary ===")
    width = max(len(name) for name, _, _ in results)
    for name, ok, seconds in results:
        print(f"{'PASS' if ok else 'FAIL'}  {name.ljust(width)}  {seconds:6.1f}s")
    if args.skip_e2e:
        print(f"SKIP  {'browser e2e (Playwright)'.ljust(width)}  (--skip-e2e)")
    failed = [name for name, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)} of {len(results)} steps passed" + (f"; failed: {', '.join(failed)}" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
