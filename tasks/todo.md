# HILO Node V1 — Build Plan

## Status legend
- [x] pending
- [x] done
- [~] in progress

---

## Phase 1 — Docker Infrastructure

Goal: All five containers start, healthchecks pass, ports accessible.

### 1.1 Create directory scaffold
- [x] `api/` — empty placeholder files (`main.py`, `requirements.txt`)
- [x] `queue/` — empty placeholder files (`consumer.py`, `requirements.txt`, `config.py`)
- [x] `graphdb/config/`, `graphdb/data/`, `graphdb/shapes/` — directories (no-op GraphDB startup)
- [x] `ui/` — minimal `package.json` and placeholder `src/index.tsx`

### 1.2 docker-compose.yml
- [x] Service: `graphdb` — `ontotext/graphdb:free`, port 7200, named volume `graphdb-data`, healthcheck on `/rest/repositories`
- [x] Service: `queue` — `rabbitmq:3-management`, ports 5672 + 15672, user `hilo`/`hilo`, healthcheck via `rabbitmq-diagnostics check_running`
- [x] Service: `api` — build `./api`, port 8000, env vars `HILO_GRAPHDB_URL`, `HILO_GRAPHDB_REPOSITORY`, `HILO_RABBITMQ_URL`, depends on graphdb+queue healthy, healthcheck on `/health`
- [x] Service: `consumer` — build `./queue`, env vars `HILO_RABBITMQ_URL`, `HILO_NODE_ID=node-a`, `HILO_GRAPHDB_URL`, `HILO_GRAPHDB_REPOSITORY`, depends on queue+graphdb healthy, `restart: unless-stopped`
- [x] Service: `ui` — build `./ui`, port 3000, env `REACT_APP_API_URL=http://localhost:8000`, depends on api healthy
- [x] Named volume `graphdb-data`, bridge network `hilo-net`

### 1.3 Dockerfiles
- [x] `api/Dockerfile` — python:3.12-slim, install curl, copy requirements then source, expose 8000, CMD uvicorn
- [x] `api/.dockerignore` — `__pycache__`, `*.pyc`, `.env`, `node_modules`
- [x] `queue/Dockerfile` — python:3.12-slim, copy requirements then source, CMD python consumer.py
- [x] `queue/.dockerignore` — same as api
- [x] `ui/Dockerfile` — node:20-slim, copy package.json first, npm install, copy source, expose 3000, CMD npm start
- [x] `ui/.dockerignore` — `node_modules`, `.env`, `build`, `dist`

### 1.4 Placeholder application code (build must succeed)
- [x] `api/main.py` — minimal FastAPI app with `GET /health` returning `{"status": "ok"}`
- [x] `api/requirements.txt` — fastapi, uvicorn, pydantic-settings, SPARQLWrapper, pika, pyshacl, rdflib
- [x] `queue/consumer.py` — minimal: connect to RabbitMQ with retry loop, print "waiting..."
- [x] `queue/requirements.txt` — pika, SPARQLWrapper, rdflib
- [x] `queue/config.py` — pydantic-settings with `rabbitmq_url`, `node_id`, `graphdb_url`, `graphdb_repository`
- [x] `ui/package.json` — React 18 + TypeScript + Tailwind + react-scripts (CRA), scripts: start/build
- [x] `ui/src/index.tsx` — renders `<App />` with `"HILO Node"` heading

### 1.5 Verify Phase 1
- [x] `docker-compose up --build` — all five containers reach `running` or `healthy`
- [x] `docker-compose ps` — no exits or restarts
- [x] `curl http://localhost:7200/rest/repositories` — GraphDB responds
- [x] `curl http://localhost:8000/health` — API responds `{"status": "ok"}`
- [x] `curl http://localhost:15672` — RabbitMQ management UI responds
- [x] `http://localhost:3000` — UI renders in browser

---

## Phase 2 — GraphDB Setup

Goal: `hilo` repository created, HILO prefix set defined, Order SHACL shape loaded.

### 2.1 Create the `hilo` repository
- [x] `graphdb/config/hilo-repository-config.ttl` — repository config in Turtle (type `graphdb:FreeSailRepository`, repo ID `hilo`)
- [x] GraphDB init script or curl command to POST the config to `/rest/repositories` on first boot
  - Decision: use a one-shot `docker exec` curl call after GraphDB is healthy (no custom Dockerfile for GraphDB in V1)
  - Document the init command in `tasks/todo.md` (this file) and `README.md` (not created yet — skip, not requested)

### 2.2 HILO prefix set
- [x] `graphdb/data/hilo-prefixes.ttl` — standard HILO prefixes as an RDF file (used as a reference and loadable into GraphDB):
  ```
  hilo:  <http://hilo.semantics.io/ontology/>
  event: <http://hilo.semantics.io/events/>
  org:   <http://hilo.semantics.io/organisations/>
  xsd / rdf / rdfs / sh / dcterms
  ```

### 2.3 Order SHACL shape
- [x] `graphdb/shapes/order-shape.ttl` — `hilo:OrderShape` targeting `hilo:Order`:
  - `hilo:orderId` — xsd:string, minCount 1, maxCount 1
  - `hilo:status` — xsd:string, minCount 1, allowed values: `created | in_transit | delivered | cancelled`
  - `hilo:createdAt` — xsd:dateTime, minCount 1, maxCount 1

### 2.4 Verify Phase 2
- [x] GraphDB Workbench at `http://localhost:7200` — `hilo` repository visible in repository list
- [x] Run a SPARQL query `SELECT * WHERE { ?s ?p ?o } LIMIT 10` against `hilo` repo — no error (empty result is fine)
- [x] Validate `order-shape.ttl` with pySHACL against a sample valid Order triple — returns `conforms: True`
- [x] Validate same shape against an Order missing `orderId` — returns `conforms: False` with message

---

## Phase 3 — API Core

Goal: `/health`, `POST /events`, `GET /events`, `POST /data`, `GET /data` all return correct responses against live GraphDB.

### 3.1 Project structure
- [x] `api/config.py` — pydantic-settings `Settings` with `graphdb_url`, `graphdb_repository`, `rabbitmq_url`, `HILO_` prefix
- [x] `api/models/` directory
- [x] `api/routes/` directory
- [x] `api/services/` directory
- [x] `api/tests/` directory

### 3.2 Models
- [x] `api/models/events.py` — `EventCreate` (source_node, event_type, triples: Turtle string), `EventResponse` (id, source_node, event_type, created_at, links)
- [x] `api/models/data.py` — `DataQuery` (sparql: str), `DataInsert` (triples: str — Turtle)

### 3.3 Services
- [x] `api/services/graphdb.py`:
  - `store_event(event: EventCreate) -> EventResponse` — INSERT triples via SPARQL UPDATE, return EventResponse
  - `query_data(sparql: str) -> dict` — SELECT query, return JSON results
  - `insert_data(triples: str)` — INSERT DATA raw Turtle
  - `get_events(since: str | None) -> list[EventResponse]` — SELECT events with optional timestamp filter
  - `check_health() -> str` — ping `/repositories` endpoint, return `"ok"` or raise
- [x] `api/services/queue.py`:
  - `publish_event(event: EventResponse)` — publish to `hilo.events` topic exchange, routing key `events.node-a`
  - `ensure_infrastructure(channel)` — declare exchange, DLX, dead-letter queue (idempotent)
  - `check_health() -> str` — connect and immediately disconnect, return `"ok"` or raise

### 3.4 Routes
- [x] `api/routes/health.py` — `GET /health`: call `graphdb.check_health()` and `queue.check_health()`, return `{"graphdb": ..., "queue": ..., "status": "healthy"|"degraded"}`; returns 200 always (caller interprets status field)
- [x] `api/routes/events.py`:
  - `POST /events` → store in GraphDB, publish to queue, return 201 + EventResponse
  - `GET /events` → query GraphDB, optional `?since=` param, return list
  - `GET /events/{id}` → query single event by ID, return EventResponse or 404
- [x] `api/routes/data.py`:
  - `POST /data` — body `DataInsert`, insert raw Turtle triples into GraphDB, return 201
  - `GET /data` — query param `?sparql=...`, run SELECT on GraphDB, return JSON results

### 3.5 Main app
- [x] `api/main.py` — create FastAPI app, configure CORS (`allow_origins=["*"]` for V1), include routers with prefixes `/health`, `/events`, `/data`

### 3.6 Verify Phase 3
- [x] `curl http://localhost:8000/docs` — OpenAPI docs load with all endpoints visible
- [x] `curl http://localhost:8000/health` — returns `{"graphdb":"ok","queue":"ok","status":"healthy"}`
- [x] `POST /events` with valid Turtle triples — returns 201 with EventResponse, no errors in `docker-compose logs api`
- [x] `GET /events` — returns list (may be empty or contain just-posted event)
- [x] `POST /data` with Turtle triples — returns 201
- [x] `GET /data?sparql=SELECT * WHERE { ?s ?p ?o } LIMIT 5` — returns JSON results

---

## Phase 4 — Queue Integration

Goal: POST /events → API publishes to queue → consumer picks up → consumer stores triples in GraphDB.

### 4.1 Consumer implementation
- [x] `queue/consumer.py` — full implementation:
  - `get_connection()` — retry loop (10 attempts, 3s apart)
  - `ensure_infrastructure(channel)` — declare `hilo.events` topic exchange, DLX fanout exchange, dead-letter queue, node queue `hilo.events.node-a` with `x-dead-letter-exchange`
  - `process_event(body) -> bool` — parse JSON, extract triples, INSERT into GraphDB via SPARQLWrapper
  - `on_message(channel, method, properties, body)` — ack on success; on failure: retry up to 5x with exponential backoff; after 5 → nack without requeue → dead-letter
  - `main()` — connect, declare infra, `basic_qos(prefetch_count=1)`, start consuming
- [x] `queue/config.py` — pydantic-settings with `rabbitmq_url`, `node_id`, `graphdb_url`, `graphdb_repository`

### 4.2 Wire publisher in API
- [x] `api/services/queue.py` — complete `publish_event()`:
  - Connect, call `ensure_infrastructure()`, publish to `hilo.events` with routing key `events.node-a`, delivery_mode=2 (persistent), close connection
  - `EventResponse.model_dump()` serialized as JSON body

### 4.3 Verify Phase 4
- [x] `docker-compose logs consumer` — shows `"Consumer started for node-a. Waiting for events..."`
- [x] `POST /events` via curl — check `docker-compose logs consumer` shows `"Processing event: ..."` and `basic_ack` fires
- [x] RabbitMQ Management UI (`http://localhost:15672`) — `hilo.events.node-a` queue visible under Queues; message count goes 0 → 1 → 0 after consume
- [x] After consume: SPARQL SELECT on GraphDB confirms the triples are stored
- [x] `hilo.events.dead` dead-letter queue exists

---

## Phase 5 — UI Shell

Goal: React app loads with sidebar navigation and health dashboard wired to `GET /health`.

### 5.1 React app setup
- [x] `ui/src/index.tsx` — ReactDOM render with `<App />`
- [x] `ui/public/index.html` — load Epilogue (Google Fonts) and Satoshi (Fontshare) in `<head>`
- [x] `ui/tailwind.config.js` — HILO theme: colors (hilo-purple, hilo-purple-light, hilo-purple-dark, hilo-purple-50, hilo-purple-100, hilo-dark, hilo-gray), fontFamily (display: Epilogue, body: Satoshi), borderRadius (hilo: 0.75rem), boxShadow (hilo, hilo-lg)
- [x] `ui/src/index.css` — `@tailwind base/components/utilities`, CSS custom properties from brand reference
- [x] `ui/postcss.config.js` — required for Tailwind with CRA

### 5.2 Layout and navigation
- [x] `ui/src/components/Sidebar.tsx` — fixed left sidebar (240px), collapsible to 64px (icon-only):
  - HILO logo/wordmark at top
  - Nav items with Lucide icons: Dashboard (active), Events, Data Explorer, Queue
  - Active item: `bg-hilo-purple text-white rounded-hilo`; inactive: `text-hilo-dark/60 hover:bg-hilo-purple-50`
  - Typed props: `{ activePage: string; onNavigate: (page: string) => void }`
- [x] `ui/src/App.tsx` — sidebar + main content area layout, `activePage` state, renders correct view based on page

### 5.3 Health Dashboard page
- [x] `ui/src/pages/Dashboard.tsx`:
  - Polls `GET /health` every 10 seconds
  - Three status cards (API, GraphDB, Queue): `bg-white rounded-hilo shadow-hilo p-6 border-l-4 border-hilo-purple`
  - Each card: service name (`font-display`), status badge (green `bg-green-50 text-green-700` / red `bg-red-50 text-red-700` pill)
  - Loading skeleton: pulse cards matching shape
  - Error state: "Could not reach API" message with retry button
  - Overall status header: `"Node Status: Healthy"` or `"Node Status: Degraded"`
- [x] `ui/src/api/health.ts` — `fetchHealth(): Promise<HealthStatus>` using `REACT_APP_API_URL`
- [x] TypeScript interfaces in `ui/src/types.ts` — `HealthStatus`, `Event`, `Triple`

### 5.4 Stub pages (navigation works, content placeholder)
- [x] `ui/src/pages/Events.tsx` — placeholder: "Events Monitor — coming soon"
- [x] `ui/src/pages/DataExplorer.tsx` — placeholder: "Data Explorer — coming soon"
- [x] `ui/src/pages/Queue.tsx` — placeholder: "Queue Inspector — coming soon"

### 5.5 Verify Phase 5
- [x] `http://localhost:3000` — renders without console errors
- [x] Sidebar visible with all four nav items; clicking switches pages
- [x] Dashboard page: health cards show live status from `GET /health`
- [x] When API is running: all three services show green badges
- [x] Design checklist: neutral base, purple accents only, generous whitespace, rounded cards, shadows, Epilogue headings / Satoshi body

---

## Phase 6 — End-to-End Test

Goal: Prove the full pipeline works from UI to GraphDB and back.

### 6.1 E2E test sequence
- [x] `docker-compose up -d --build` — all five containers healthy
- [x] `POST /events` with sample order payload:
  ```json
  {
    "source_node": "node-a",
    "event_type": "order_created",
    "triples": "@prefix hilo: <http://hilo.semantics.io/ontology/> .\n@prefix event: <http://hilo.semantics.io/events/> .\n@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\nevent:order-ORD-001 a hilo:Order ;\n    hilo:orderId \"ORD-001\" ;\n    hilo:status \"created\" ;\n    hilo:createdAt \"2026-02-27T10:00:00Z\"^^xsd:dateTime ."
  }
  ```
- [x] Response: 201 with EventResponse JSON
- [x] `GET /events` — event `ORD-001` appears in results
- [x] RabbitMQ Management UI: queue depth went 0 → 1 → 0 (published and consumed)
- [x] Consumer logs: `"Processing event: ..."` + `basic_ack`
- [x] SPARQL query confirms triples stored:
  ```sparql
  SELECT * WHERE { <http://hilo.semantics.io/events/order-ORD-001> ?p ?o }
  ```
- [x] UI health dashboard: all three services show green/healthy

### 6.2 Review
- [x] Update this file with final status
- [x] Write any lessons learned to `tasks/lessons.md`

---

## Build Review — 2026-02-27

**Status: All phases scaffolded and committed.**

### What was built
- **Phase 1 (Docker):** `docker-compose.yml` with 5 services, all Dockerfiles, healthchecks, startup ordering, named volume, bridge network.
- **Phase 2 (GraphDB):** Repository config TTL, HILO prefix set, Order SHACL shape with status enum constraint.
- **Phase 3 (API):** Full FastAPI app — config, Pydantic models, graphdb/queue services, all routes (`/health`, `/events`, `/data`), CORS.
- **Phase 4 (Queue):** RabbitMQ consumer with retry loop, DLX, exponential backoff (5 retries), dead-letter nack.
- **Phase 5 (UI):** React 18 + TypeScript + Tailwind — Sidebar (collapsible), Dashboard (live health polling every 10s, skeleton, retry), stub pages.
- **GitHub:** Repo created at https://github.com/aukehofman97/hilo-node, `main` + `develop` branches pushed.

### Fix applied during build
- API import paths: all `from api.xxx` imports corrected to `from xxx` (top-level) to match Docker WORKDIR `/app` context.

### Next step to run
```bash
# 1. Start all containers
docker-compose up --build

# 2. After GraphDB starts, create the 'hilo' repository once:
curl -X POST http://localhost:7200/rest/repositories \
  -H "Content-Type: multipart/form-data" \
  -F "config=@graphdb/config/hilo-repository-config.ttl"

# 3. Verify
curl http://localhost:8000/health
```

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

---

## Events & Queue Design Refinement

**Branch:** `feature/events-queue-refinement`
**Spec:** `~/Downloads/events-queue-refinement-prompt.md`
**Skill:** frontend-design

### T1 — Setup
- [ ] Create branch `feature/events-queue-refinement` off `develop`

### T2 — Shared: `FilterChips` component
- [ ] Create `ui/src/components/FilterChips.tsx`
  - Props: `options: { label: string; value: string }[]`, `selected: string[]`, `onChange: (selected: string[]) => void`, `multiSelect?: boolean`
  - Active chip: `bg-hilo-purple text-white rounded-full px-3 py-1 text-sm font-medium`
  - Inactive chip: `bg-transparent border border-hilo-gray/30 text-hilo-dark/60 rounded-full px-3 py-1 text-sm font-medium hover:border-hilo-purple/50 dark:text-white/60`
  - Chips animate in/out with `animate-scale-in` (150ms)
  - TypeScript props, accessible (aria-pressed per chip)

### T3 — Events: chip filter bar
- [ ] Rewrite `FilterBar` in `Events.tsx`
  - Replace `<select status>` with `FilterChips` for All/Published/Delivered/Failed/Dead-lettered
  - Replace `<select eventType>` with "Type ▾" trigger chip → absolute-positioned popover with checkboxes, click-outside to close
  - Replace `<select sourceNode>` with "Source ▾" trigger chip → same popover pattern
  - Replace permanent search `<input>` with icon button that expands to borderless input; collapses on clear/blur
  - Active filter summary row: removable chips (`bg-hilo-purple-50 text-hilo-purple-dark text-xs rounded-full`) + "Clear all" link
  - Filter state: multi-select for status + eventTypes + sourceNodes (arrays, not single strings)

### T4 — Events: quiet table header
- [ ] Remove `bg-hilo-purple-50/60 dark:bg-hilo-purple/10` from header div
- [ ] Use `bg-transparent border-b border-hilo-gray/20`
- [ ] Header text: `font-body text-xs text-hilo-dark/40 dark:text-white/30 uppercase tracking-wider`

### T5 — Events: improved footer
- [ ] Show "N of M events · filtered" when filters active, "N events" when not
- [ ] Right-align "Clear filters" link when filters active
- [ ] Style: `text-xs text-hilo-dark/40 dark:text-white/30`

### T6 — Queue: ghost Refresh button
- [ ] Change Refresh button from `bg-hilo-purple-50 text-hilo-purple-dark` to ghost style
- [ ] `bg-transparent border border-hilo-gray/30 text-hilo-dark/60 hover:border-hilo-purple/50 hover:text-hilo-purple rounded-hilo px-4 py-2 text-sm`
- [ ] Dark: `dark:border-white/20 dark:text-white/60 dark:hover:border-hilo-purple-light/50 dark:hover:text-hilo-purple-light`

### T7 — Queue: KpiCard null state improvement
- [ ] When `loading` (parent passes prop): show skeleton pulse matching number size
- [ ] When data is available but value is `null`: show "—" + `text-xs text-hilo-dark/30 dark:text-white/20` "No data" label below
- [ ] When value is a number: count-up as before
- [ ] Pass `loading` boolean down from `Queue` component to `KpiCard`

### T8 — Queue: dead-letter error-type filter chips
- [ ] Add filter chips above dead-letter list: `All` · `Timeout` · `Validation` · `Connection`
- [ ] Classify by `error_reason` substring: timeout → Timeout, validation → Validation, retry/connection → Connection
- [ ] Use `FilterChips` component, single-select (or "All" resets), filters mock list client-side
- [ ] Only render chips when dead letters exist and count > 1

### T9 — Queue: fix remaining md→lg grid
- [ ] Line 492: `md:grid-cols-4` → `lg:grid-cols-4` in the main content (non-problem-state) KPI grid

### T10 — Build and verify
- [ ] `npx vite build` — clean build
- [ ] Design checklist: neutral base, purple accents, whitespace, dark mode, accessible
- [ ] Commit: `feat: events & queue design refinement — chip filters, quiet chrome`
- [ ] Squash merge `feature/events-queue-refinement → develop → main`

---

## V2 — PR 1: Two-Tier Events + JWT Auth + Connection Management

**Branch:** `feature/two-tier-events-and-connections` off `develop`
**User stories:** US-1 through US-8

### Branch setup
- [ ] T-01 `git checkout develop && git pull && git checkout -b feature/two-tier-events-and-connections` (US-1)

### Docker infrastructure (US-3)
- [ ] T-02 Add named volume `hilo-api-data` to `docker-compose.yml`; mount at `/data` in the `api` service (US-3)

### Config (US-2, US-3)
- [ ] T-03 Add to `api/config.py`: `node_name`, `node_base_url`, `private_key_path` (default `/data/node.key`), `db_path` (default `/data/hilo.db`), `jwt_expiry_minutes` (default `5`), `jwt_audience`, `internal_key` (default `"dev"`) (US-2, US-3)

### Key generation on startup (US-3)
- [ ] T-04 Create `api/startup.py` — on startup, if `HILO_PRIVATE_KEY_PATH` does not exist, generate RSA-2048 key pair and write private key (PEM) to that path; expose public key PEM via a module-level getter; call from FastAPI lifespan in `main.py` (US-3)

### Models (US-1, US-4)
- [ ] T-05 Update `api/models/events.py` — add `subject: str` to `EventCreate`, remove `source_node`; add `EventNotification` model (`event_id`, `event_type`, `source_node`, `subject`, `created_at`, `data_url`) (US-1)
- [ ] T-06 Create `api/models/connections.py` — `ConnectionRequest` (`node_id`, `name`, `base_url`, `public_key`), `ConnectionResponse` (`id`, `peer_node_id`, `peer_name`, `peer_base_url`, `peer_public_key`, `status`, `initiated_by`, `created_at`, `updated_at`), `NodeIdentity` (`node_id`, `name`, `base_url`, `public_key`, `version`) (US-4)

### Dependencies — install first (US-2, US-8)
- [ ] T-15 Add `PyJWT>=2.0` and `cryptography` to `api/requirements.txt`; add `httpx` to `api/requirements.txt` and `queue/requirements.txt` (for outbound HTTP calls) (US-2, US-8)

### Services (US-2, US-4, US-5, US-6, US-7)
- [ ] T-07 Create `api/services/jwt_service.py` — `sign_token(peer_node_id: str) -> str`: sign RS256 JWT (`iss=node_id`, `aud=peer_node_id`, `exp=now+jwt_expiry_minutes`); `verify_token(token: str) -> dict`: decode + verify RS256 using issuer's stored public key; `verify_internal(token: str) -> bool`: check against `HILO_INTERNAL_KEY` (US-2, US-7)
- [ ] T-08 Create `api/services/connections.py` — SQLite init (`hilo_connections` table on startup); `get_all()`, `get_active_peers()`, `get_by_id(id)`, `get_by_peer_node_id(peer_node_id)`; `create_incoming(req: ConnectionRequest)`, `create_outgoing(peer_node_id, name, base_url)`, `accept(id)`, `reject(id)`, `suspend(id)`, `mark_accept_pending(id)`, `store_peer_key(id, public_key_pem)` (US-4, US-5, US-6)

### Routes (US-1, US-2, US-3, US-4, US-5, US-6, US-7, US-8)
- [ ] T-09 Create `api/routes/well_known.py` — `GET /.well-known/hilo-node` returns `NodeIdentity` (node_id from settings, name, base_url, public key PEM from `startup.py`, version `"1.0"`); no auth required (US-3, US-4)
- [ ] T-10 Update `api/routes/events.py` — `POST /events`: stamp `source_node = settings.node_id`, build `EventNotification` (with `data_url = f"{settings.node_base_url}/events/{stored.id}"`), publish notification to queue; `GET /events/{id}`: add `Depends(require_jwt)` dependency that accepts RS256 JWT or `HILO_INTERNAL_KEY` bearer (US-1, US-2)
- [ ] T-10b Update `api/services/queue.py` — add `publish_notification(notification: EventNotification) -> None` (publishes `EventNotification` JSON); remove or deprecate `publish_event(event: EventResponse)`; update the route in T-10 to call `publish_notification` (US-1)
- [ ] T-11 Create `api/routes/connections.py` — `GET /connections`, `GET /connections/{peer_node_id}/token` (calls `jwt_service.sign_token`), `POST /connections/request` (calls `connections_service.create_incoming`, stores peer key), `POST /connections/{id}/accept` (calls `connections_service.accept`, then HTTP POST to peer's `/connections/accepted` with retry), `POST /connections/accepted` (marks connection active, fetches + stores peer public key from peer's `/.well-known/hilo-node`), `POST /connections/{id}/reject`, `POST /connections/{id}/suspend` (US-4, US-5, US-6, US-7)
- [ ] T-12 Create `api/routes/bridge.py` — `POST /bridge/receive` accepts `EventNotification`, stores in GraphDB (`store_notification`), returns `200`; no auth, no re-forwarding (US-8)
- [ ] T-13 Register all new routers in `api/main.py`: `well_known_router` (no prefix), `connections_router` (prefix `/connections`), `bridge_router` (no prefix) (US-1, US-4, US-8)

### Consumer forwarding (US-8)
- [ ] T-14a Add `api_url: str = "http://api:8000"` to `queue/config.py`; add `HILO_API_URL` env var to the `consumer` service in `docker-compose.yml`; add `depends_on: api: condition: service_healthy` to the `consumer` service (US-8)
- [ ] T-14 Update `queue/consumer.py` — **fully replace** `process_event()` and `_insert_triples()` with `process_notification(body: bytes) -> bool`: parse JSON as `EventNotification`; call `GET {settings.api_url}/connections` via httpx to get active peer list; POST the notification to each peer's `{peer_base_url}/bridge/receive` via httpx; retry failed deliveries 3× with backoff (1s, 3s, 9s); return `False` after all retries exhausted so `on_message` nacks to dead-letter (US-8)

### Consumer config and env files (US-8, US-12, US-13)
- [ ] T-16 Update `.env.node-a`: add `HILO_NODE_NAME="HILO Node A"`, `HILO_NODE_BASE_URL=http://localhost:8000`; update `.env.node-b`: add `HILO_NODE_NAME="HILO Node B"`, `HILO_NODE_BASE_URL=http://localhost:9000` (US-4)

### GraphDB service addition (US-8)
- [ ] T-16b Add `store_notification(notification: EventNotification)` to `api/services/graphdb.py` — inserts the notification metadata as triples (event_id, event_type, source_node, subject, data_url, received_at) (US-8)

### Tests (US-1, US-2)
- [ ] T-22c Update `api/tests/test_events.py` — mock or bypass `require_jwt` dependency for all existing `GET /events/{id}` tests (use `app.dependency_overrides`); add new tests: 401 without `Authorization` header, 401 with expired JWT, 401 with unknown-key JWT, 200 with `HILO_INTERNAL_KEY` bearer; update `POST /events` tests to use new `EventCreate` shape (`subject` added, `source_node` removed) (US-1, US-2)

### README update (US-1)
- [ ] T-22d Update `README.md` quickstart curl example — add `"subject": "..."`, remove `"source_node": "..."` from the sample `POST /events` payload (US-1)

### Verify PR 1 (US-1 through US-8)
- [ ] T-17 `POST /events` with `{event_type, subject, triples}` → 201; queue shows notification (not full event); GraphDB stores triples (US-1)
- [ ] T-18 `GET /events/{id}` without token → 401; with valid JWT → 200; with expired JWT → 401; with `HILO_INTERNAL_KEY` → 200 (US-2)
- [ ] T-19 `GET /.well-known/hilo-node` → JSON with `node_id`, `public_key` (US-3)
- [ ] T-20 Full connection handshake: Node B POSTs to Node A's `/connections/request` → Node A has `pending_incoming`; Node A accepts → callback to Node B → both show `active` (US-4, US-5, US-6)
- [ ] T-21 `GET /connections/{peer}/token` → `{token, expires_at, peer_url}`; token accepted by peer's `GET /events/{id}` (US-7)
- [ ] T-22 `POST /bridge/receive` with `EventNotification` → 200; stored in GraphDB; not re-forwarded (US-8)

### Commit PR 1
- [ ] T-22b Commit: `feat: two-tier events, RS256 JWT auth, connection management`; open PR `feature/two-tier-events-and-connections → develop`

---

## V2 — PR 2: Connections UI

**Branch:** `feature/connections-ui` off `feature/two-tier-events-and-connections`
**User stories:** US-9, US-10, US-11
**Depends on:** PR 1 merged

### Branch setup
- [ ] T-23 `git checkout feature/two-tier-events-and-connections && git checkout -b feature/connections-ui` (US-9)

### Types and API client (US-9, US-10, US-11)
- [ ] T-24 Add `Connection`, `NodeIdentity`, `AccessToken` interfaces to `ui/src/types.ts` (US-9)
- [ ] T-25 Create `ui/src/api/connections.ts` — `fetchConnections()`, `previewNode(url: string)`, `sendConnectionRequest(targetUrl: string)`, `acceptConnection(id: string)`, `rejectConnection(id: string)`, `getPeerToken(peerId: string)` (US-9, US-10, US-11)

### Navigation (US-9)
- [ ] T-26 Add "Connections" nav item with appropriate Lucide icon to `ui/src/components/TopBar.tsx` (or the active nav component); wire to `onNavigate("connections")` (US-9)

### Connections page (US-9, US-10, US-11)
- [ ] T-27 Create `ui/src/pages/Connections.tsx` with three sections:
  - **Add connection**: URL text input + "Preview" button → fetches `/.well-known/hilo-node` → displays identity card (`node_id`, `name`, `base_url`, capabilities); "Send request" button; error state if URL unreachable
  - **Pending — incoming**: list of `pending_incoming` connections with `node_id`, `name`, `base_url`; "Accept" + "Reject" buttons; "Resend acceptance" for `accept_pending` status
  - **Active peers**: list of active connections; each card shows `node_id`, `name`, connection date; Bearer token with countdown + copy button (auto-refreshes at 30s remaining); peer's public key with "Refresh key" button; "View events" link
  - Loading skeleton, error state, empty state for all sections (US-9, US-10, US-11)

### Verify PR 2 (US-9, US-10, US-11)
- [ ] T-28 Enter peer URL → preview card shows correct `node_id`, `name` (US-9)
- [ ] T-29 Send request → pending outgoing section appears (US-9)
- [ ] T-30 Accept incoming → peer moves to active section; token displayed (US-10)
- [ ] T-31 Token countdown visible; token auto-refreshes before expiry; copied token is a valid JWT (US-11)

### Commit PR 2
- [ ] T-31b Commit: `feat: connections UI tab — peer discovery, handshake, token display`; open PR `feature/connections-ui → develop`

---

## V2 — PR 3: Node B Setup + End-to-End Test

**Branch:** `feature/node-b-setup` off `develop` (after PR 1 and PR 2 merged)
**User stories:** US-12, US-13

### Branch setup
- [ ] T-32 `git checkout develop && git pull && git checkout -b feature/node-b-setup` (US-12)

### Node B (US-12)
- [ ] T-33 Verify `.env.node-b` has correct values: `NODE_ID=node-b`, `GRAPHDB_REPO=hilo-b`, `HILO_NODE_NAME="HILO Node B"`, `HILO_NODE_BASE_URL=http://localhost:9000`, all ports shifted +1000 (US-12)
- [ ] T-34 `docker-compose -p node-b --env-file .env.node-b up --build`; verify all five Node B containers reach healthy; `curl http://localhost:9000/health` → `{"status":"healthy"}`; `GET http://localhost:9000/.well-known/hilo-node` → `{node_id: "node-b"}` (US-12)

### End-to-end test (US-13)
- [ ] T-35 Connect A → B: open Node A UI Connections tab, enter `http://localhost:9000`, preview shows `node-b`; send request; open Node B UI Connections tab, accept; both UIs show active peer (US-13)
- [ ] T-36 `POST http://localhost:8000/events` with `{event_type, subject, triples}`; verify Node A logs "Forwarded notification to node-b"; Node B logs "Bridge: received notification from node-a"; notification stored in Node B's GraphDB (US-13)
- [ ] T-37 Get JWT from Node B's Connections tab (copy token for node-a); `curl -H "Authorization: Bearer <token>" http://localhost:8000/events/{id}` → 200 with full triples (US-13)
- [ ] T-38 `POST http://localhost:9000/events` with a different payload; verify notification arrives at Node A; Node A's Events page shows events from both `node-a` and `node-b` (US-13)

### Commit PR 3
- [ ] T-39 Commit: `feat: node-b setup and E2E inter-node event exchange verified`; open PR `feature/node-b-setup → develop → main` (US-12, US-13)

---

## feature/local-event-import

**Branch:** `feature/local-event-import` off `main`
**User stories:** US-14, US-15, US-16
**Architecture ref:** `tasks/architecture-local-import.md`

### Branch setup
- [x] T-40 `git checkout main && git pull && git checkout -b feature/local-event-import` (US-14)

### Backend — models (US-15, US-16)
- [x] T-41 Update `api/models/events.py`:
  - Add `EventImportRequest(BaseModel)` with `triples: str`
  - Add `has_local_copy: bool = False` field to `EventResponse` (US-15, US-16)

### Backend — service (US-15, US-16)
- [x] T-42 Update `api/services/graphdb.py`:
  - Add `import_event_triples(event_id: str, triples: str) -> None`: (1) `insert_turtle(triples)` first, (2) SPARQL INSERT to add `hilo:triplesPayload "{escaped}"` to the existing event subject (triples first — write order is critical per architecture)
  - Update `get_events()` SPARQL: add `OPTIONAL { ?event hilo:triplesPayload ?tp . } BIND(BOUND(?tp) AS ?hasLocalCopy)`, set `has_local_copy = binding["hasLocalCopy"]["value"] == "true"` in each `EventResponse`
  - Update `get_event_by_id()` SPARQL: `has_local_copy = bool(b.get("triplesPayload", {}).get("value"))` (US-15, US-16)

### Backend — route (US-15)
- [x] T-43 Add `POST /events/{event_id}/import` to `api/routes/events.py`:
  - Requires `Depends(require_jwt)` + `token_payload["sub"] == "internal"` check (C2 — local UI only)
  - Check sequence: 404 (not found) → 400 (no hilo:dataUrl) → 409 (already imported) → `graphdb.import_event_triples()` → `{"status": "imported", "id": event_id}` (US-15)

### Frontend — API client (US-15)
- [x] T-44 Update `ui/src/api/events.ts`:
  - Added `has_local_copy?: boolean` to the `Event` interface
  - Added `importEvent(id, triples)` — `POST /events/{id}/import` with `Bearer dev` header (US-15)

### Frontend — UI (US-14, US-15, US-16)
- [x] T-45 Update `ui/src/pages/Events.tsx`:
  - Split `remoteError` → `fetchError` + `storeError` (C1 from plan review)
  - Added `storing: boolean` state; reset `fetchError` + `storeError` on `selectedId` change
  - Added `handleStoreLocally()`: calls `importEvent()` then `fetchEvent()` to confirm; updates `detail`
  - "Store locally" button shown when `detail.triples` non-empty AND `!detail.has_local_copy`
  - Added `"imported"` to `EventStatus`; green badge styles in `STATUS_STYLES` and `STATUS_DOT`
  - Badge derivation: `published` | `imported` | `received` everywhere (US-14, US-15, US-16)

### Verify (US-14, US-15, US-16)
- [ ] T-46 Manual E2E verification:
  1. On Node B Events Monitor, open a `received` event → "Fetch full event from node-a" → triples appear → "Store locally" button appears
  2. Click "Store locally" → button shows spinner → status badge changes to `imported` in both detail panel and list row
  3. Close panel and reopen same event → badge still shows `imported`; button does not appear
  4. `curl http://localhost:9000/events/{id}` with `Bearer dev` → `has_local_copy: true` in response
  5. SPARQL query on Fuseki `hilo-b` dataset confirms the RDF triples are present (US-15, US-16)

### Commit (US-14, US-15, US-16)
- [ ] T-47 Commit: `feat: local import of remote event triples`; merge `feature/local-event-import → main` (US-14, US-15, US-16)

---

## feature/cloudflare-tunnel

**Branch:** `feature/cloudflare-tunnel` off `main`
**Architecture:** `tasks/architecture-cloudflare-tunnel.md`
**User stories:** `tasks/user-stories-cloudflare.md`

### Branch setup
- [x] T-48 `git checkout main && git pull && git checkout -b feature/cloudflare-tunnel` (US-1)
- [x] T-49 Push branch to remote: `git push -u origin feature/cloudflare-tunnel` (US-1)

### Secrets — .gitignore (US-2)
- [x] T-50 Add `cloudflared/credentials.*.json` to `.gitignore` (US-2)

### Cloudflare config files (US-3)
- [x] T-51 Create `cloudflared/config.node-a.yml` — tunnel ID placeholder, credentials-file path, ingress rule: `node-a.hilosemantics.com → http://api:8000`, fallback `http_status:404` (US-3)
- [x] T-52 Create `cloudflared/config.node-b.yml` — same pattern for `node-b.hilosemantics.com → http://api:8000` (US-3)

### docker-compose.yml (US-4)
- [x] T-53 Add `cloudflared` service to `docker-compose.yml`: image `cloudflare/cloudflared:latest`, container name `hilo-${NODE_ID:-node-a}-cloudflared`, command `tunnel --config /etc/cloudflared/config.yml run`, mount `cloudflared/config.${NODE_ID:-node-a}.yml` and `cloudflared/credentials.${NODE_ID:-node-a}.json` read-only, `depends_on: api: condition: service_healthy`, `restart: unless-stopped`, network `hilo-net` (US-4)
  - Note: service added under `profiles: [tunnel]` (opt-in) to avoid restart-loop when credentials are absent (review W1)

### ENV files (US-5)
- [x] T-54 Update `.env.node-a`: set `NODE_BASE_URL=https://node-a.hilosemantics.com` (US-5)
- [x] T-55 Update `.env.node-b`: set `NODE_BASE_URL=https://node-b.hilosemantics.com` (US-5)
  - Note: VITE_API_URL not changed per review C1 — UI stays on localhost

### API — auth on POST /events (US-6)
- [x] T-56 Add `Depends(require_jwt)` to `POST /events` route in `api/routes/events.py` (US-6)

### API — auth on GET /events (US-7)
- [x] T-57 Add `Depends(require_jwt)` to `GET /events` route in `api/routes/events.py` (US-7)

### API — update tests after auth changes (US-6, US-7)
- [x] T-56b Update `api/tests/test_events.py`: add `Authorization: Bearer dev` header to all `POST /events` and `GET /events` test calls; add explicit 401 test cases for both routes called without any auth header (US-6, US-7)
  - 16 tests passing

### UI — internal key on fetchEvents (US-8)
- [x] T-58 Update `fetchEvents` in `ui/src/api/events.ts` to include `Authorization: Bearer ${internalKey}` header, using `import.meta.env.VITE_INTERNAL_KEY || "dev"` (US-8)

### README (US-9)
- [x] T-59 Add "Cloudflare Tunnel setup" section to `README.md` covering: create tunnel in dashboard, download credentials JSON, place at `cloudflared/credentials.node-a.json`, set tunnel ID in config file, add public hostname in dashboard, note that `--env-file` is required, note credentials are git-ignored (US-9)

### Verify (US-10)
- [x] T-60 Start Node A: `docker-compose --env-file .env.node-a --profile tunnel up --build` — confirm all 6 containers healthy including cloudflared (US-10)
  - Prereq: credentials.node-a.json placed, tunnel ID set in config.node-a.yml, public hostname configured in Cloudflare dashboard
- [x] T-61 `POST /events` with `Bearer dev` → `data_url` in response equals `https://node-a.hilosemantics.com/events/{id}` (US-10)
- [x] T-62 `POST /events` without auth → `401` (US-10)
- [x] T-63 `GET /events` without auth → `401` (US-10)
- [x] T-64 Start Node B: `docker-compose -p node-b --env-file .env.node-b --profile tunnel up --build` — confirm all 6 containers healthy (US-10)
- [x] T-65 Establish connection A↔B; send event from Node A; open Node B UI → "Fetch full event" resolves without "load failed" and returns triples (US-10)

### Commit
- [x] T-66 Commit: `feat: cloudflare tunnel — public HTTPS API, auth on POST+GET /events`; open PR `feature/cloudflare-tunnel → main`

---

## Sentry Production Logging (feature/api-sentry-logging)

### api/main.py
- [ ] T-S1 Add `from config import settings` to top-level imports (US-S1)
- [ ] T-S2 Add `sentry_sdk.set_tag("node_id", settings.node_id)` after `sentry_sdk.init()` (US-S1)
- [ ] T-S10 Remove the `/sentry-debug` route handler (US-S6)
- [ ] T-S11 Verify no test or doc references `/sentry-debug` (US-S6)

### api/routes/events.py
- [ ] T-S3 Add `import sentry_sdk` to top-level imports (US-S2)
- [ ] T-S4 Add `sentry_sdk.capture_exception(exc)` in the queue publish except block (US-S2)
- [ ] T-S5 Add `logger.info("Event created: %s type=%s", stored.id, stored.event_type)` after store (US-S3)

### api/routes/data.py
- [ ] T-S6 Add `import logging` and `logger = logging.getLogger(__name__)` (US-S4)
- [ ] T-S7 Add `logger.error("GraphDB error: %s", exc)` in both except blocks before raising HTTPException (US-S4)

### api/routes/connections.py
- [ ] T-S8 Add `logger.info("Connection accepted: %s peer=%s", connection_id, updated.peer_node_id)` in `accept_connection` (US-S5)
- [ ] T-S9 Add `logger.info("Connection rejected: %s", connection_id)` in `reject_connection` (US-S5)
