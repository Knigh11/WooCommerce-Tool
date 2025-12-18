"""
FastAPI application entry point.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.api.v1.router import router as v1_router
from app.deps import close_redis
from app.schemas.common import HealthResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown."""
    # Startup
    yield
    # Shutdown
    await close_redis()


app = FastAPI(
    title="WooCommerce Backend API",
    description="FastAPI backend for WooCommerce store management",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify allowed origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(v1_router, prefix="/api/v1")


@app.get("/api/v1/health", response_model=HealthResponse, tags=["health"])
async def health_check():
    """Health check endpoint."""
    return HealthResponse(ok=True)


@app.get("/api/v1/health/redis", tags=["health"])
async def health_check_redis():
    """Check Redis connection health."""
    from app.deps import get_redis
    try:
        redis = await get_redis()
        await redis.ping()
        return {"ok": True, "redis": "connected"}
    except Exception as e:
        return {"ok": False, "redis": "disconnected", "error": str(e)}


@app.get("/", tags=["root"])
async def root():
    """Root endpoint."""
    return {
        "message": "WooCommerce Backend API",
        "version": "1.0.0",
        "docs": "/docs"
    }

