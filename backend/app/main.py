"""FastAPI application:  uvicorn app.main:app  (run from backend/)

The repository is scanned once, during startup (lifespan), and the results are
kept in memory. Startup fails if the configured repository path is invalid.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.analysis import RepositoryAnalysis
from app.api.config import resolve_repo_path, validate_repo_path
from app.api.routes import router
from app.graph.dependency_graph import UnknownModuleError

FRONTEND_ORIGINS = ["http://localhost:5173"]  # Vite dev server


def create_app(repo_path: Path | str | None = None) -> FastAPI:
    """Build the app. repo_path overrides CODEATLAS_REPO (used by tests)."""

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        root = resolve_repo_path() if repo_path is None else validate_repo_path(Path(repo_path))
        app.state.analysis = RepositoryAnalysis.load(root)
        yield

    app = FastAPI(title="CodeAtlas", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=FRONTEND_ORIGINS,
        allow_methods=["GET"],
        allow_headers=["*"],
    )

    @app.exception_handler(UnknownModuleError)
    async def unknown_module(request: Request, exc: UnknownModuleError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    app.include_router(router)
    return app


app = create_app()
