"""
FastAPI application entrypoint for the Swiss Parcel Quick-Check backend.

This module creates the FastAPI `app` object that the ASGI server runs:

    cd backend && uvicorn app.main:app --port 8000

It enables permissive CORS (allow_origins=['*']) so the browser can call the
backend during development regardless of the dev-server origin, includes the API
router (all endpoints under /api), and closes the shared httpx client on
shutdown so connections are cleaned up.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .geoadmin import close_client
from .routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.

    There is nothing to do on startup; on shutdown we close the shared
    httpx.AsyncClient so pooled connections are released cleanly. This replaces
    the older @app.on_event("shutdown") hook, which is deprecated in FastAPI.
    """
    yield
    await close_client()


# The FastAPI application object. `title` shows up in the auto-generated docs;
# `lifespan` wires in the shutdown cleanup defined above.
app = FastAPI(title="Swiss Parcel Quick-Check API", lifespan=lifespan)

# Permissive CORS: allow any origin/method/header. In production this list would
# normally be narrowed, but for this app the backend only proxies public data.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the five API endpoints (they already carry the /api prefix).
app.include_router(router)


@app.get("/health")
async def health() -> dict:
    """
    Simple liveness probe.

    Returns:
      A small JSON object {"status": "ok"} so a caller can confirm the backend
      is up without hitting any external API.
    """
    return {"status": "ok"}
