from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
