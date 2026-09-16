"""FastAPI application entry point."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from zealo import __version__
from zealo.api.routes import router
from zealo.config import settings

DISCLAIMER = (
    "Facility locations and medicine lists come from public sources. Stock levels are "
    "estimates. PHC availability patterns come from a 2021-22 published survey and are "
    "assigned to map locations for illustration."
)

app = FastAPI(
    title="Zealo Map API",
    version=__version__,
    description="Medicine inventory map and redistribution simulation for Gadag taluk.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


app.include_router(router)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe. Also carries the disclaimer so no client can miss it."""
    return {"status": "ok", "version": __version__, "disclaimer": DISCLAIMER}
