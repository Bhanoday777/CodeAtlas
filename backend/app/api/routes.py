"""Route handlers. Each one reads the startup analysis and reshapes it into a schema.

Unknown module IDs raise UnknownModuleError from the graph engine; app.main
turns that into a 404.
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.analysis import LIMITATIONS, RepositoryAnalysis
from app.api.schemas import (
    AffectedModuleOut,
    GraphEdge,
    GraphNode,
    GraphResponse,
    GraphSummary,
    HealthResponse,
    ImpactResponse,
    ImportEntry,
    ImportIssue,
    ModuleDetail,
    ScanErrorOut,
    ScanIssuesResponse,
)
from app.parser.models import ImportKind

router = APIRouter(prefix="/api")


def get_analysis(request: Request) -> RepositoryAnalysis:
    return request.app.state.analysis


@router.get("/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    analysis = get_analysis(request)
    return HealthResponse(
        status="ok",
        repository=analysis.name,
        module_count=len(analysis.graph.modules),
        edge_count=len(analysis.graph.edges),
    )


@router.get("/graph", response_model=GraphResponse)
def graph(request: Request) -> GraphResponse:
    analysis = get_analysis(request)
    g, modules, error_paths = analysis.graph, analysis.scan.modules, analysis.error_paths()
    nodes = [
        GraphNode(
            id=module_id,
            path=modules[module_id].path,
            is_package=modules[module_id].is_package,
            has_scan_error=modules[module_id].path in error_paths,
            dependency_count=len(g.dependencies_of(module_id)),
            dependent_count=len(g.dependents_of(module_id)),
        )
        for module_id in g.modules
    ]
    return GraphResponse(
        repository=analysis.name,
        nodes=nodes,
        edges=[GraphEdge(source=a, target=b) for a, b in g.edges],
        summary=GraphSummary(
            modules=len(g.modules),
            edges=len(g.edges),
            external_imports=len(analysis.imports_of_kind(ImportKind.EXTERNAL)),
            unresolved_imports=len(analysis.imports_of_kind(ImportKind.UNRESOLVED)),
            scan_errors=len(analysis.scan.errors),
            warnings=len(analysis.self_imports()),
        ),
    )


@router.get("/modules/{module_id}", response_model=ModuleDetail)
def module_detail(module_id: str, request: Request) -> ModuleDetail:
    analysis = get_analysis(request)
    dependencies = analysis.graph.dependencies_of(module_id)  # raises for unknown IDs
    info = analysis.scan.modules[module_id]

    def entries(kind: ImportKind) -> list[ImportEntry]:
        return [
            ImportEntry(raw=imp.raw, lineno=imp.lineno)
            for imp in analysis.imports_of_kind(kind)
            if imp.source == module_id
        ]

    return ModuleDetail(
        id=module_id,
        path=info.path,
        is_package=info.is_package,
        has_scan_error=info.path in analysis.error_paths(),
        dependencies=list(dependencies),
        dependents=list(analysis.graph.dependents_of(module_id)),
        external_imports=entries(ImportKind.EXTERNAL),
        unresolved_imports=entries(ImportKind.UNRESOLVED),
    )


@router.get("/impact/{module_id}", response_model=ImpactResponse)
def impact(module_id: str, request: Request) -> ImpactResponse:
    analysis = get_analysis(request)
    report = analysis.graph.impact(module_id)
    return ImpactResponse(
        changed_module=report.changed_module,
        affected=[
            AffectedModuleOut(id=m.module_id, distance=m.distance, path=list(m.path))
            for m in report.affected
        ],
        direct=[m.module_id for m in report.direct],
        transitive=[m.module_id for m in report.transitive],
        diagnostics=analysis.impact_diagnostics(),
    )


@router.get("/scan/issues", response_model=ScanIssuesResponse)
def scan_issues(request: Request) -> ScanIssuesResponse:
    analysis = get_analysis(request)

    def issues(imports) -> list[ImportIssue]:
        return [ImportIssue(module=imp.source, raw=imp.raw, lineno=imp.lineno) for imp in imports]

    errors = sorted(analysis.scan.errors, key=lambda e: (e.path, e.lineno or 0, e.message))
    return ScanIssuesResponse(
        scan_errors=[ScanErrorOut(path=e.path, message=e.message, lineno=e.lineno) for e in errors],
        unresolved_imports=issues(analysis.imports_of_kind(ImportKind.UNRESOLVED)),
        self_imports=issues(analysis.self_imports()),
        diagnostics=analysis.all_diagnostics(),
        limitations=LIMITATIONS,
    )
