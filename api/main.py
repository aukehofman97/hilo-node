from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import health, events, data

app = FastAPI(
    title="HILO Node API",
    description="Semantic data sharing node — V1",
    version="1.0.0",
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
