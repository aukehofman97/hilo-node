# API Patterns Reference

Detailed code patterns for the HILO Node API. Consult this when implementing specific components.

## Route/Service Separation

```python
# routes/events.py — HTTP concerns only
from fastapi import APIRouter, HTTPException
from models.events import EventCreate, EventResponse
from services.graphdb import store_event
from services.queue import publish_event

router = APIRouter()

@router.post("/events", response_model=EventResponse, status_code=201)
async def create_event(event: EventCreate):
    try:
        stored = store_event(event)
    except GraphDBConnectionError:
        raise HTTPException(status_code=503, detail="GraphDB unavailable")
    try:
        publish_event(stored)
    except QueueConnectionError:
        raise HTTPException(status_code=503, detail="Queue unavailable")
    return stored
```

## Pydantic Models

```python
# models/events.py
from pydantic import BaseModel
from datetime import datetime

class EventCreate(BaseModel):
    source_node: str
    event_type: str
    triples: str  # RDF in Turtle syntax

class EventResponse(BaseModel):
    id: str
    source_node: str
    event_type: str
    created_at: datetime
    links: list[str]  # URIs referencing stored data
```

## GraphDB Service (SPARQLWrapper)

```python
# services/graphdb.py
from SPARQLWrapper import SPARQLWrapper, JSON, POST
from config import settings

def get_sparql_query():
    return SPARQLWrapper(f"{settings.graphdb_url}/repositories/{settings.graphdb_repository}")

def get_sparql_update():
    return SPARQLWrapper(f"{settings.graphdb_url}/repositories/{settings.graphdb_repository}/statements")

def store_event(event: EventCreate) -> EventResponse:
    sparql = get_sparql_update()
    sparql.setMethod(POST)
    sparql.setQuery(f"""
        INSERT DATA {{
            {event.triples}
        }}
    """)
    sparql.query()
    # ... build and return EventResponse

def query_data(sparql_query: str) -> dict:
    sparql = get_sparql_query()
    sparql.setQuery(sparql_query)
    sparql.setReturnFormat(JSON)
    return sparql.query().convert()
```

## Configuration

```python
# config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    graphdb_url: str = "http://graphdb:7200"
    graphdb_repository: str = "hilo"
    rabbitmq_url: str = "amqp://hilo:hilo@queue:5672/"

    class Config:
        env_prefix = "HILO_"

settings = Settings()
```

## Queue Service (pika)

```python
# services/queue.py
import json
import pika
from config import settings

def publish_event(event: EventResponse):
    connection = pika.BlockingConnection(
        pika.URLParameters(settings.rabbitmq_url)
    )
    channel = connection.channel()
    channel.queue_declare(queue="events", durable=True)
    channel.basic_publish(
        exchange="",
        routing_key="events",
        body=json.dumps(event.model_dump(), default=str),
        properties=pika.BasicProperties(delivery_mode=2)  # persistent
    )
    connection.close()
```

## Testing Pattern

```python
# tests/test_events.py
from fastapi.testclient import TestClient
from unittest.mock import patch
from main import app

client = TestClient(app)

def test_create_event_success():
    with patch("routes.events.store_event") as mock_store, \
         patch("routes.events.publish_event") as mock_publish:
        mock_store.return_value = {"id": "123", "source_node": "A", ...}
        response = client.post("/events", json={
            "source_node": "A",
            "event_type": "order_created",
            "triples": "<http://ex.org/order-1> <http://ex.org/status> \"created\" ."
        })
        assert response.status_code == 201
        mock_publish.assert_called_once()

def test_create_event_graphdb_down():
    with patch("routes.events.store_event", side_effect=GraphDBConnectionError):
        response = client.post("/events", json={...})
        assert response.status_code == 503

def test_create_event_invalid_input():
    response = client.post("/events", json={})
    assert response.status_code == 422
```

## Patterns to Avoid

- No SPARQL in route handlers. Always through services.
- No hardcoded URLs. Use config.py + environment variables.
- No raw dicts as responses. Use Pydantic models.
- No business logic in routes. Routes translate HTTP to service calls.
- No building V2+ endpoints in V1. Design for them, don't implement.
