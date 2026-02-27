---
name: api-development
description: Build and maintain FastAPI backend services for the HILO Node. Use when creating API endpoints, route handlers, Pydantic models, or service layers. Use when user says "create endpoint", "add route", "build API", "POST/GET handler", "Pydantic model", "OpenAPI spec", or "API tests". Do NOT use for frontend work (use frontend skill), queue/messaging (use async-messaging skill), or SPARQL queries (use rdf-transformation skill).
metadata:
  author: HILO Semantics
  version: 1.0.0
---

# API Development (FastAPI)

The API is the central interface of a HILO Node. It handles event exchange between nodes, data access to the GraphDB, and legacy system integration.

## Tech Stack

- **Framework**: FastAPI
- **Models**: Pydantic v2
- **GraphDB client**: SPARQLWrapper (queries Ontotext GraphDB's SPARQL endpoint over HTTP)
- **Queue client**: pika (publishes to RabbitMQ)
- **Testing**: pytest + FastAPI TestClient
- **Docs**: Auto-generated OpenAPI (built into FastAPI)

## Instructions

### Step 1: Check project structure

Before writing any code, verify the `api/` folder follows this layout:

```
api/
├── Dockerfile
├── requirements.txt
├── main.py              # FastAPI app, CORS, startup/shutdown
├── config.py            # Environment variables via pydantic-settings
├── models/              # Pydantic request/response models
├── routes/              # One file per resource (events.py, data.py, health.py)
├── services/            # Business logic (graphdb.py, queue.py)
└── tests/               # One test file per route file
```

If files are missing, create them. Never put all routes in `main.py`.

### Step 2: Write the endpoint

Follow this pattern for every endpoint:

1. Define Pydantic models in `models/`
2. Write the service function in `services/` (this does the actual work: SPARQL queries, queue publishing)
3. Write the route handler in `routes/` (this only handles HTTP: parse request, call service, return response)
4. Register the router in `main.py`

CRITICAL: Never put SPARQL queries or pika calls directly in route handlers. Always go through a service.

### Step 3: Handle errors

Catch service-level exceptions and translate them to HTTP errors:
- GraphDB unavailable → 503
- Validation failure → 422
- Resource not found → 404
- Queue unavailable → 503

### Step 4: Configure via environment variables

All connection strings come from `config.py` using pydantic-settings. Never hardcode hostnames, ports, or credentials. Docker-compose sets these as environment variables.

### Step 5: Test

Write tests using FastAPI TestClient + pytest. Mock GraphDB and RabbitMQ connections. For each endpoint, test: happy path, validation errors, service failures.

## V1 Endpoints

**Events:**
- `POST /events` — Publish event. Store in GraphDB, publish to queue.
- `GET /events` — List recent events. Supports `?since={timestamp}`.
- `GET /events/{id}` — Get specific event.

**Data:**
- `GET /data` — SPARQL query on GraphDB. Returns JSON.
- `POST /data` — Insert RDF triples into GraphDB.

**Health:**
- `GET /health` — Status of API, GraphDB, and RabbitMQ connections.

For later versions (V2+): `/upload`, `/webhook`, JWT middleware. Design with these in mind but do not implement until needed.

## Examples

**Example 1: "Create a POST endpoint for events"**

Actions:
1. Create `EventCreate` and `EventResponse` models in `models/events.py`
2. Create `store_event()` in `services/graphdb.py` and `publish_event()` in `services/queue.py`
3. Create route in `routes/events.py` that calls both services
4. Register router in `main.py`

Result: Working `POST /events` endpoint visible in OpenAPI docs at `/docs`.

**Example 2: "Add a health check endpoint"**

Actions:
1. Create `routes/health.py` with a `GET /health` handler
2. Ping GraphDB and RabbitMQ, return status per service
3. Return 200 if all healthy, 503 if any service is down

Result: `GET /health` returns `{"graphdb": "ok", "queue": "ok", "status": "healthy"}`.

**Example 3: "Write tests for the events endpoints"**

Actions:
1. Create `tests/test_events.py`
2. Mock `services/graphdb.store_event` and `services/queue.publish_event`
3. Test: valid event returns 201, missing fields returns 422, GraphDB down returns 503

Result: All tests pass with `pytest api/tests/`.

## Troubleshooting

**Error: `ConnectionRefusedError` when calling GraphDB**
Cause: GraphDB container not running or wrong hostname.
Solution: Check `docker-compose ps`. Verify `HILO_GRAPHDB_URL` in config matches the service name in docker-compose.yml (default: `http://graphdb:7200`).

**Error: `pika.exceptions.AMQPConnectionError`**
Cause: RabbitMQ container not ready.
Solution: Add retry logic in `services/queue.py` or use a startup health check in `main.py` that waits for RabbitMQ.

**Error: Routes not showing in `/docs`**
Cause: Router not registered in `main.py`.
Solution: Verify `app.include_router(events.router, prefix="/events")` exists in `main.py`.

## References

For detailed code patterns and examples, see `references/api-patterns.md`.
