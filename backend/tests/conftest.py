"""Shared pytest options and reporting.

--update-contract  rewrite the committed API snapshots in contract/fixture/
                   (see tests/contract/test_contract_snapshots.py). Never on by default.

Integration tests record measured runtimes with `record_timing`; they are printed
in the terminal summary so every run reports actual numbers, not just pass/fail.
"""

from __future__ import annotations

import pytest

_TIMINGS: list[tuple[str, str]] = []


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--update-contract",
        action="store_true",
        default=False,
        help="Rewrite contract/fixture/*.json from the current API. Review the git diff afterwards.",
    )


@pytest.fixture
def record_timing():
    """record_timing(label, text): add a line to the end-of-run timing report."""

    def record(label: str, text: str) -> None:
        _TIMINGS.append((label, text))

    return record


def pytest_terminal_summary(terminalreporter) -> None:
    if not _TIMINGS:
        return
    terminalreporter.section("measured runtimes")
    width = max(len(label) for label, _ in _TIMINGS)
    for label, text in _TIMINGS:
        terminalreporter.write_line(f"{label.ljust(width)}  {text}")
