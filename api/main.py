import sys
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings

_testing = "pytest" in sys.modules

sentry_sdk.init(
    dsn="" if _testing else "https://7c8ba4f75ecc2bb6f89a4060a2447b96@o4511019058331648.ingest.de.sentry.io/4511019060822096",
    send_default_pii=True,
    enable_logs=True,
    traces_sample_rate=1.0,
    profile_session_sample_rate=1.0,
    profile_lifecycle="trace",
)
sentry_sdk.set_tag("node_id", settings.node_id)

from routes import bridge, connections, data, events, health, queue_stats, well_known


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Generate RSA key pair on first boot (no-op if key already exists)
    from startup import ensure_key_pair
    ensure_key_pair()
    # Initialise SQLite connections table
    from services.connections import init_db
    init_db()
    yield


app = FastAPI(
    title="HILO Node API",
    description="Semantic data sharing node — V2",
    version="2.0.0",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(events.router)
app.include_router(data.router)
app.include_router(queue_stats.router)
app.include_router(connections.router)
app.include_router(bridge.router)
app.include_router(well_known.router)
