"""Response schemas: the JSON contract the frontend relies on.

Conventions shared by every endpoint:
- Module IDs are dotted Python names ("shop.models.order"). In URLs they are
  sent percent-encoded (encodeURIComponent on the frontend); plain ASCII IDs
  are unchanged by that, and FastAPI decodes them before lookup.
- An edge {source, target} means source imports target.
- Every list is sorted, so identical scans give identical responses.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class Diagnostic(BaseModel):
    """A known reason the analysis may be incomplete.

    code: "scan_errors" | "unresolved_imports" | "self_imports"
    """

    code: str
    message: str


class HealthResponse(BaseModel):
    status: Literal["ok"]
    repository: str
    module_count: int
    edge_count: int


class GraphNode(BaseModel):
    id: str
    path: str
    is_package: bool
    has_scan_error: bool
    dependency_count: int
    dependent_count: int


class GraphEdge(BaseModel):
    source: str
    target: str


class GraphSummary(BaseModel):
    modules: int
    edges: int
    external_imports: int
    unresolved_imports: int
    scan_errors: int
    warnings: int


class GraphResponse(BaseModel):
    repository: str
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    summary: GraphSummary


class ImportEntry(BaseModel):
    """One import statement as written in the module."""

    raw: str
    lineno: int


class ModuleDetail(BaseModel):
    id: str
    path: str
    is_package: bool
    has_scan_error: bool
    dependencies: list[str]
    dependents: list[str]
    external_imports: list[ImportEntry]
    unresolved_imports: list[ImportEntry]


class AffectedModuleOut(BaseModel):
    id: str
    distance: int
    path: list[str]


class ImpactResponse(BaseModel):
    """Produced by DependencyGraph.impact(); the API only reshapes it."""

    changed_module: str
    affected: list[AffectedModuleOut]
    direct: list[str]
    transitive: list[str]
    diagnostics: list[Diagnostic]


class ScanErrorOut(BaseModel):
    path: str
    message: str
    lineno: int | None


class ImportIssue(BaseModel):
    module: str
    raw: str
    lineno: int


class ScanIssuesResponse(BaseModel):
    scan_errors: list[ScanErrorOut]
    unresolved_imports: list[ImportIssue]
    self_imports: list[ImportIssue]
    diagnostics: list[Diagnostic]
    limitations: list[str]
