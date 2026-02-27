# HILO Node V1 — Build Plan

## Status legend
- [ ] pending
- [x] done
- [~] in progress

---

## Phase 1 — Docker Infrastructure

Goal: All five containers start, healthchecks pass, ports accessible.

### 1.1 Create directory scaffold
- [ ] `api/` — empty placeholder files (`main.py`, `requirements.txt`)
- [ ] `queue/` — empty placeholder files (`consumer.py`, `requirements.txt`, `config.py`)
- [ ] `graphdb/config/`, `graphdb/data/`, `graphdb/shapes/` — directories (no-op GraphDB startup)
- [ ] `ui/` — minimal `package.json` and placeholder `src/index.tsx`

### 1.2 docker-compose.yml
- [ ] Service: `graphdb` — `ontotext/graphdb:free`, port 7200, named volume `graphdb-data`, healthcheck on `/rest/repositories`
- [ ] Service: `queue` — `rabbitmq:3-management`, ports 5672 + 15672, user `hilo`/`hilo`, healthcheck via `rabbitmq-diagnostics check_running`
- [ ] Service: `api` — build `./api`, port 8000, env vars `HILO_GRAPHDB_URL`, `HILO_GRAPHDB_REPOSITORY`, `HILO_RABBITMQ_URL`, depends on graphdb+queue healthy, healthcheck on `/health`
- [ ] Service: `consumer` — build `./queue`, env vars `HILO_RABBITMQ_URL`, `HILO_NODE_ID=node-a`, `HILO_GRAPHDB_URL`, `HILO_GRAPHDB_REPOSITORY`, depends on queue+graphdb healthy, `restart: unless-stopped`
- [ ] Service: `ui` — build `./ui`, port 3000, env `REACT_APP_API_URL=http://localhost:8000`, depends on api healthy
- [ ] Named volume `graphdb-data`, bridge network `hilo-net`

### 1.3 Dockerfiles
- [ ] `api/Dockerfile` — python:3.12-slim, install curl, copy requirements then source, expose 8000, CMD uvicorn
- [ ] `api/.dockerignore` — `__pycache__`, `*.pyc`, `.env`, `node_modules`
- [ ] `queue/Dockerfile` — python:3.12-slim, copy requirements then source, CMD python consumer.py
- [ ] `queue/.dockerignore` — same as api
- [ ] `ui/Dockerfile` — node:20-slim, copy package.json first, npm install, copy source, expose 3000, CMD npm start
- [ ] `ui/.dockerignore` — `node_modules`, `.env`, `build`, `dist`

### 1.4 Placeholder application code (build must succeed)
- [ ] `api/main.py` — minimal FastAPI app with `GET /health` returning `{"status": "ok"}`
- [ ] `api/requirements.txt` — fastapi, uvicorn, pydantic-settings, SPARQLWrapper, pika, pyshacl, rdflib
- [ ] `queue/consumer.py` — minimal: connect to RabbitMQ with retry loop, print "waiting..."
- [ ] `queue/requirements.txt` — pika, SPARQLWrapper, rdflib
- [ ] `queue/config.py` — pydantic-settings with `rabbitmq_url`, `node_id`, `graphdb_url`, `graphdb_repository`
- [ ] `ui/package.json` — React 18 + TypeScript + Tailwind + react-scripts (CRA), scripts: start/build
- [ ] `ui/src/index.tsx` — renders `<App />` with `"HILO Node"` heading

### 1.5 Verify Phase 1
- [ ] `docker-compose up --build` — all five containers reach `running` or `healthy`
- [ ] `docker-compose ps` — no exits or restarts
- [ ] `curl http://localhost:7200/rest/repositories` — GraphDB responds
- [ ] `curl http://localhost:8000/health` — API responds `{"status": "ok"}`
- [ ] `curl http://localhost:15672` — RabbitMQ management UI responds
- [ ] `http://localhost:3000` — UI renders in browser

---

## Phase 2 — GraphDB Setup

Goal: `hilo` repository created, HILO prefix set defined, Order SHACL shape loaded.

### 2.1 Create the `hilo` repository
- [ ] `graphdb/config/hilo-repository-config.ttl` — repository config in Turtle (type `graphdb:FreeSailRepository`, repo ID `hilo`)
- [ ] GraphDB init script or curl command to POST the config to `/rest/repositories` on first boot
  - Decision: use a one-shot `docker exec` curl call after GraphDB is healthy (no custom Dockerfile for GraphDB in V1)
  - Document the init command in `tasks/todo.md` (this file) and `README.md` (not created yet — skip, not requested)

### 2.2 HILO prefix set
- [ ] `graphdb/data/hilo-prefixes.ttl` — standard HILO prefixes as an RDF file (used as a reference and loadable into GraphDB):
  ```
  hilo:  <http://hilo.semantics.io/ontology/>
  event: <http://hilo.semantics.io/events/>
  org:   <http://hilo.semantics.io/organisations/>
  xsd / rdf / rdfs / sh / dcterms
  ```

### 2.3 Order SHACL shape
- [ ] `graphdb/shapes/order-shape.ttl` — `hilo:OrderShape` targeting `hilo:Order`:
  - `hilo:orderId` — xsd:string, minCount 1, maxCount 1
  - `hilo:status` — xsd:string, minCount 1, allowed values: `created | in_transit | delivered | cancelled`
  - `hilo:createdAt` — xsd:dateTime, minCount 1, maxCount 1

### 2.4 Verify Phase 2
- [ ] GraphDB Workbench at `http://localhost:7200` — `hilo` repository visible in repository list
- [ ] Run a SPARQL query `SELECT * WHERE { ?s ?p ?o } LIMIT 10` against `hilo` repo — no error (empty result is fine)
- [ ] Validate `order-shape.ttl` with pySHACL against a sample valid Order triple — returns `conforms: True`
- [ ] Validate same shape against an Order missing `orderId` — returns `conforms: False` with message

---

## Phase 3 — API Core

Goal: `/health`, `POST /events`, `GET /events`, `POST /data`, `GET /data` all return correct responses against live GraphDB.

### 3.1 Project structure
- [ ] `api/config.py` — pydantic-settings `Settings` with `graphdb_url`, `graphdb_repository`, `rabbitmq_url`, `HILO_` prefix
- [ ] `api/models/` directory
- [ ] `api/routes/` directory
- [ ] `api/services/` directory
- [ ] `api/tests/` directory

### 3.2 Models
- [ ] `api/models/events.py` — `EventCreate` (source_node, event_type, triples: Turtle string), `EventResponse` (id, source_node, event_type, created_at, links)
- [ ] `api/models/data.py` — `DataQuery` (sparql: str), `DataInsert` (triples: str — Turtle)

### 3.3 Services
- [ ] `api/services/graphdb.py`:
  - `store_event(event: EventCreate) -> EventResponse` — INSERT triples via SPARQL UPDATE, return EventResponse
  - `query_data(sparql: str) -> dict` — SELECT query, return JSON results
  - `insert_data(triples: str)` — INSERT DATA raw Turtle
  - `get_events(since: str | None) -> list[EventResponse]` — SELECT events with optional timestamp filter
  - `check_health() -> str` — ping `/repositories` endpoint, return `"ok"` or raise
- [ ] `api/services/queue.py`:
  - `publish_event(event: EventResponse)` — publish to `hilo.events` topic exchange, routing key `events.node-a`
  - `ensure_infrastructure(channel)` — declare exchange, DLX, dead-letter queue (idempotent)
  - `check_health() -> str` — connect and immediately disconnect, return `"ok"` or raise

### 3.4 Routes
- [ ] `api/routes/health.py` — `GET /health`: call `graphdb.check_health()` and `queue.check_health()`, return `{"graphdb": ..., "queue": ..., "status": "healthy"|"degraded"}`; returns 200 always (caller interprets status field)
- [ ] `api/routes/events.py`:
  - `POST /events` → store in GraphDB, publish to queue, return 201 + EventResponse
  - `GET /events` → query GraphDB, optional `?since=` param, return list
  - `GET /events/{id}` → query single event by ID, return EventResponse or 404
- [ ] `api/routes/data.py`:
  - `POST /data` — body `DataInsert`, insert raw Turtle triples into GraphDB, return 201
  - `GET /data` — query param `?sparql=...`, run SELECT on GraphDB, return JSON results

### 3.5 Main app
- [ ] `api/main.py` — create FastAPI app, configure CORS (`allow_origins=["*"]` for V1), include routers with prefixes `/health`, `/events`, `/data`

### 3.6 Verify Phase 3
- [ ] `curl http://localhost:8000/docs` — OpenAPI docs load with all endpoints visible
- [ ] `curl http://localhost:8000/health` — returns `{"graphdb":"ok","queue":"ok","status":"healthy"}`
- [ ] `POST /events` with valid Turtle triples — returns 201 with EventResponse, no errors in `docker-compose logs api`
- [ ] `GET /events` — returns list (may be empty or contain just-posted event)
- [ ] `POST /data` with Turtle triples — returns 201
- [ ] `GET /data?sparql=SELECT * WHERE { ?s ?p ?o } LIMIT 5` — returns JSON results

---

## Phase 4 — Queue Integration

Goal: POST /events → API publishes to queue → consumer picks up → consumer stores triples in GraphDB.

### 4.1 Consumer implementation
- [ ] `queue/consumer.py` — full implementation:
  - `get_connection()` — retry loop (10 attempts, 3s apart)
  - `ensure_infrastructure(channel)` — declare `hilo.events` topic exchange, DLX fanout exchange, dead-letter queue, node queue `hilo.events.node-a` with `x-dead-letter-exchange`
  - `process_event(body) -> bool` — parse JSON, extract triples, INSERT into GraphDB via SPARQLWrapper
  - `on_message(channel, method, properties, body)` — ack on success; on failure: retry up to 5x with exponential backoff; after 5 → nack without requeue → dead-letter
  - `main()` — connect, declare infra, `basic_qos(prefetch_count=1)`, start consuming
- [ ] `queue/config.py` — pydantic-settings with `rabbitmq_url`, `node_id`, `graphdb_url`, `graphdb_repository`

### 4.2 Wire publisher in API
- [ ] `api/services/queue.py` — complete `publish_event()`:
  - Connect, call `ensure_infrastructure()`, publish to `hilo.events` with routing key `events.node-a`, delivery_mode=2 (persistent), close connection
  - `EventResponse.model_dump()` serialized as JSON body

### 4.3 Verify Phase 4
- [ ] `docker-compose logs consumer` — shows `"Consumer started for node-a. Waiting for events..."`
- [ ] `POST /events` via curl — check `docker-compose logs consumer` shows `"Processing event: ..."` and `basic_ack` fires
- [ ] RabbitMQ Management UI (`http://localhost:15672`) — `hilo.events.node-a` queue visible under Queues; message count goes 0 → 1 → 0 after consume
- [ ] After consume: SPARQL SELECT on GraphDB confirms the triples are stored
- [ ] `hilo.events.dead` dead-letter queue exists

---

## Phase 5 — UI Shell

Goal: React app loads with sidebar navigation and health dashboard wired to `GET /health`.

### 5.1 React app setup
- [ ] `ui/src/index.tsx` — ReactDOM render with `<App />`
- [ ] `ui/public/index.html` — load Epilogue (Google Fonts) and Satoshi (Fontshare) in `<head>`
- [ ] `ui/tailwind.config.js` — HILO theme: colors (hilo-purple, hilo-purple-light, hilo-purple-dark, hilo-purple-50, hilo-purple-100, hilo-dark, hilo-gray), fontFamily (display: Epilogue, body: Satoshi), borderRadius (hilo: 0.75rem), boxShadow (hilo, hilo-lg)
- [ ] `ui/src/index.css` — `@tailwind base/components/utilities`, CSS custom properties from brand reference
- [ ] `ui/postcss.config.js` — required for Tailwind with CRA

### 5.2 Layout and navigation
- [ ] `ui/src/components/Sidebar.tsx` — fixed left sidebar (240px), collapsible to 64px (icon-only):
  - HILO logo/wordmark at top
  - Nav items with Lucide icons: Dashboard (active), Events, Data Explorer, Queue
  - Active item: `bg-hilo-purple text-white rounded-hilo`; inactive: `text-hilo-dark/60 hover:bg-hilo-purple-50`
  - Typed props: `{ activePage: string; onNavigate: (page: string) => void }`
- [ ] `ui/src/App.tsx` — sidebar + main content area layout, `activePage` state, renders correct view based on page

### 5.3 Health Dashboard page
- [ ] `ui/src/pages/Dashboard.tsx`:
  - Polls `GET /health` every 10 seconds
  - Three status cards (API, GraphDB, Queue): `bg-white rounded-hilo shadow-hilo p-6 border-l-4 border-hilo-purple`
  - Each card: service name (`font-display`), status badge (green `bg-green-50 text-green-700` / red `bg-red-50 text-red-700` pill)
  - Loading skeleton: pulse cards matching shape
  - Error state: "Could not reach API" message with retry button
  - Overall status header: `"Node Status: Healthy"` or `"Node Status: Degraded"`
- [ ] `ui/src/api/health.ts` — `fetchHealth(): Promise<HealthStatus>` using `REACT_APP_API_URL`
- [ ] TypeScript interfaces in `ui/src/types.ts` — `HealthStatus`, `Event`, `Triple`

### 5.4 Stub pages (navigation works, content placeholder)
- [ ] `ui/src/pages/Events.tsx` — placeholder: "Events Monitor — coming soon"
- [ ] `ui/src/pages/DataExplorer.tsx` — placeholder: "Data Explorer — coming soon"
- [ ] `ui/src/pages/Queue.tsx` — placeholder: "Queue Inspector — coming soon"

### 5.5 Verify Phase 5
- [ ] `http://localhost:3000` — renders without console errors
- [ ] Sidebar visible with all four nav items; clicking switches pages
- [ ] Dashboard page: health cards show live status from `GET /health`
- [ ] When API is running: all three services show green badges
- [ ] Design checklist: neutral base, purple accents only, generous whitespace, rounded cards, shadows, Epilogue headings / Satoshi body

---

## Phase 6 — End-to-End Test

Goal: Prove the full pipeline works from UI to GraphDB and back.

### 6.1 E2E test sequence
- [ ] `docker-compose up -d --build` — all five containers healthy
- [ ] `POST /events` with sample order payload:
  ```json
  {
    "source_node": "node-a",
    "event_type": "order_created",
    "triples": "@prefix hilo: <http://hilo.semantics.io/ontology/> .\n@prefix event: <http://hilo.semantics.io/events/> .\n@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\nevent:order-ORD-001 a hilo:Order ;\n    hilo:orderId \"ORD-001\" ;\n    hilo:status \"created\" ;\n    hilo:createdAt \"2026-02-27T10:00:00Z\"^^xsd:dateTime ."
  }
  ```
- [ ] Response: 201 with EventResponse JSON
- [ ] `GET /events` — event `ORD-001` appears in results
- [ ] RabbitMQ Management UI: queue depth went 0 → 1 → 0 (published and consumed)
- [ ] Consumer logs: `"Processing event: ..."` + `basic_ack`
- [ ] SPARQL query confirms triples stored:
  ```sparql
  SELECT * WHERE { <http://hilo.semantics.io/events/order-ORD-001> ?p ?o }
  ```
- [ ] UI health dashboard: all three services show green/healthy

### 6.2 Review
- [ ] Update this file with final status
- [ ] Write any lessons learned to `tasks/lessons.md`

---

## Notes

### Startup order
1. GraphDB (`start_period: 30s`, then healthcheck every 10s)
2. RabbitMQ (`start_period: 20s`, then healthcheck every 10s)
3. API (depends on both healthy)
4. Consumer (depends on queue + graphdb healthy)
5. UI (depends on api healthy)

### Key env vars
| Variable | Used by | Value |
|---|---|---|
| `HILO_GRAPHDB_URL` | api, consumer | `http://graphdb:7200` |
| `HILO_GRAPHDB_REPOSITORY` | api, consumer | `hilo` |
| `HILO_RABBITMQ_URL` | api, consumer | `amqp://hilo:hilo@queue:5672/` |
| `HILO_NODE_ID` | consumer | `node-a` |
| `REACT_APP_API_URL` | ui | `http://localhost:8000` |

### GraphDB repository init
The `hilo` repository must be created via REST after GraphDB starts. Command:
```bash
curl -X POST http://localhost:7200/rest/repositories \
  -H "Content-Type: multipart/form-data" \
  -F "config=@graphdb/config/hilo-repository-config.ttl"
```
Run once after first `docker-compose up`. GraphDB persists the repo in the named volume.

### CLAUDE.md note
CLAUDE.md still references `skills/` (project-level). The skills have been moved to `.claude/skills/`. This is fine — the content is the same, only the path changed.
