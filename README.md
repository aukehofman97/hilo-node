# HILO Node

A self-contained semantic data sharing node. It sits between an organisation's internal IT systems and the outside world — receiving data in whatever format the source system uses (JSON, XML, CSV, EDI), converting it to RDF, storing it in a triple store, and making it available to other nodes through APIs and event sharing.

Two organisations with completely different IT landscapes can exchange meaningful data as long as both run a node.

---

## What it does

- Accepts events via a REST API and stores them as RDF triples in GraphDB
- Buffers and delivers events through RabbitMQ with automatic retry and dead-letter handling
- Exposes a React dashboard for browsing the knowledge graph, monitoring events, and inspecting the queue
- Runs as a fully isolated Docker stack — one command to start, another to add a second node

---

## Architecture

Each node has four components:

| Component | Technology | Role |
|---|---|---|
| **Triple store** | GraphDB 10.7 | Stores and queries RDF data (SPARQL endpoint) |
| **API** | FastAPI (Python) | POST events in, GET events out, health check |
| **Queue** | RabbitMQ 3 | Buffers events, retries delivery, dead-letters failures |
| **UI** | React + Tailwind | Dashboard, Data Explorer, Events Monitor, Queue Inspector |

Event flow within a node:

```
Legacy system / curl
        │
        ▼
  POST /events  ──►  GraphDB (store RDF triples)
        │
        ▼
   RabbitMQ queue  ──►  Consumer (acknowledge + process)
                              │
                         (retry on fail, dead-letter after 5 attempts)
```

Inter-node event flow (V2+):

```
Node A API  ──►  Node A GraphDB + Queue  ──►  POST /bridge/receive on Node B
                                                      │
                                               Node B GraphDB
```

---

## Quickstart

### Prerequisites

- Docker and Docker Compose

### Run Node A (default)

```bash
docker-compose up --build
```

| Service | URL |
|---|---|
| UI | http://localhost:3000 |
| API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |
| GraphDB | http://localhost:7200 |
| RabbitMQ management | http://localhost:15672 (user: `hilo`, pass: `hilo`) |

The GraphDB repository is created automatically on first boot.

### Send a test event

```bash
# source_node is stamped server-side; subject is required (primary RDF subject URI)
# Authorization header required — default internal key is "dev"
curl -X POST http://localhost:8000/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev" \
  -d '{
    "event_type": "shipment_created",
    "subject": "https://example.org/shipment/1",
    "triples": "@prefix schema: <https://schema.org/> .\n<https://example.org/shipment/1> schema:name \"Shipment 1\" ;\n  schema:status \"created\" ."
  }'
```

To retrieve full event data (requires auth — use the internal dev key locally):

```bash
# Replace <event-id> with the id returned by POST /events
curl http://localhost:8000/events/<event-id> \
  -H "Authorization: Bearer dev"
```

Then open the UI at http://localhost:3000 — the event will appear in the Events Monitor and the triples will be queryable in the Data Explorer.

---

## Running two nodes on one machine (V2)

Node B uses the same compose file with different ports and a different env file:

```bash
# Terminal 1 — Node A (default ports)
docker-compose up --build

# Terminal 2 — Node B (ports shifted by +1)
docker-compose -p node-b --env-file .env.node-b up --build
```

| Node | UI | API | GraphDB |
|---|---|---|---|
| A | :3000 | :8000 | :7200 |
| B | :3001 | :9000 | :7201 |

The `-p node-b` flag gives Node B its own isolated Docker network and volume. No port conflicts, no shared state.

---

## Cloudflare Tunnel setup

Cloudflare Tunnel gives each node's API a real public HTTPS subdomain
(`node-a.hilosemantics.com`, `node-b.hilosemantics.com`). This fixes the
`data_url` browser fetch problem — event data URLs resolve correctly in both
peer containers and browsers without any proxy code.

The UI stays on localhost and is **not** exposed publicly in this configuration.

### Prerequisites

- A Cloudflare account with the `hilosemantics.com` domain (or your own domain)
- Docker and Docker Compose

### One-time setup per node

**Node A:**

1. Log in to the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com) → Networks → Tunnels → Create a tunnel
2. Name it `hilo-node-a` → select Docker as the connector → **skip** the Docker run command shown
3. Download the credentials JSON file from the tunnel detail page
4. Place it at `cloudflared/credentials.node-a.json` (this file is git-ignored — never committed)
5. Copy the tunnel ID (UUID shown in the dashboard) and set it in `cloudflared/config.node-a.yml`:
   ```yaml
   tunnel: <paste-tunnel-id-here>
   ```
6. In the tunnel detail page → Public Hostnames → Add a hostname:
   - Subdomain: `node-a`, Domain: `hilosemantics.com`
   - Service type: `HTTP`, URL: `api:8000`
7. (Optional) Add a rate limiting rule in Cloudflare dashboard: 100 requests / minute / IP on `node-a.hilosemantics.com`

Repeat steps 1–7 for Node B using `hilo-node-b`, `credentials.node-b.json`, `config.node-b.yml`, and subdomain `node-b`.

> The `cloudflared/credentials.node-a.json.example` file shows the expected JSON structure.

### Start a node with the tunnel

The `cloudflared` service uses a [Docker Compose profile](https://docs.docker.com/compose/how-tos/profiles/) so the stack starts cleanly without credentials for local development.

```bash
# Node A — with Cloudflare Tunnel
docker-compose --env-file .env.node-a --profile tunnel up --build

# Node B — with Cloudflare Tunnel
docker-compose -p node-b --env-file .env.node-b --profile tunnel up --build
```

**`--env-file` is required** for correct public URL operation. Without it, `NODE_BASE_URL` falls back to `http://localhost:8000` and `data_url` values will not resolve publicly.

Without `--profile tunnel`, the stack starts normally (5 containers) — useful for local development before Cloudflare credentials are in place.

### Auth on public endpoints

Once the API is reachable publicly, `POST /events` and `GET /events` require the internal Bearer key:

```bash
# POST /events — internal key required
curl -X POST https://node-a.hilosemantics.com/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev" \
  -d '{
    "event_type": "shipment_created",
    "subject": "https://example.org/shipment/1",
    "triples": "@prefix schema: <https://schema.org/> .\n<https://example.org/shipment/1> schema:name \"Shipment 1\" ."
  }'

# GET /events — internal key required
curl https://node-a.hilosemantics.com/events \
  -H "Authorization: Bearer dev"
```

The `INTERNAL_KEY` defaults to `"dev"`. Override it in `.env.node-a` for production:

```
INTERNAL_KEY=your-secret-key-here
```

The UI sets `VITE_INTERNAL_KEY` (defaults to `"dev"`) and sends it automatically — the Events Monitor continues to work without any manual steps.

---

## Project structure

```
hilo-node/
├── api/                  # FastAPI application
│   ├── main.py           # App entry point, route registration
│   ├── config.py         # Settings (env vars)
│   ├── routes/           # events.py, health.py, sparql.py, bridge.py
│   └── services/         # graphdb.py, queue_service.py
│
├── queue/                # RabbitMQ consumer
│   └── consumer.py       # Subscribes to hilo.events, retries, dead-letters
│
├── ui/                   # React frontend
│   └── src/
│       ├── pages/        # Dashboard, DataExplorer, Events, Queue
│       ├── components/   # TopBar, ServiceCard, FilterChips, ...
│       └── api/          # events.ts, queue.ts, sparql.ts
│
├── graphdb/
│   └── config/           # hilo-repository-config.ttl, shacl-shapes.ttl
│
├── scripts/
│   └── init-graphdb.sh   # Creates the GraphDB repo on first boot
│
├── docker-compose.yml    # Full stack definition
├── .env.node-a           # Node A config (default ports)
└── .env.node-b           # Node B config (ports +1)
```

---

## Environment variables

All values have defaults that match Node A. Override via `.env.node-a` / `.env.node-b` or export directly.

| Variable | Default | Description |
|---|---|---|
| `NODE_ID` | `node-a` | Node identifier (used in container names and event metadata) |
| `GRAPHDB_REPO` | `hilo` | GraphDB repository name |
| `GRAPHDB_PORT` | `7200` | Host port for GraphDB |
| `RABBITMQ_PORT` | `5672` | Host port for RabbitMQ AMQP |
| `RABBITMQ_MGMT_PORT` | `15672` | Host port for RabbitMQ management UI |
| `API_PORT` | `8000` | Host port for the FastAPI service |
| `UI_PORT` | `3000` | Host port for the React UI |

---

## Roadmap

| Version | Description | Status |
|---|---|---|
| **V1** | Single node in Docker. Ingest events, store as RDF, expose via API, visualize in UI. | ✅ Complete |
| **V2** | Duplicate to Node B on the same machine. Test event exchange between nodes via HTTP bridge. Retry + dead-letter across nodes. | Planned |
| **V3** | Move each node to a separate cloud. Same event tests over HTTPS. Introduce TLS, DNS, firewall configuration. | Planned |
| **V4** | Add eIDAS 2.0-compatible EU Business Wallets for identity verification and authenticated data sharing using Verifiable Credentials. | Planned |
| **V5** | Connect a real legacy system via the semantic adapter. AI-generated mappings: legacy data in, RDF out, and vice versa. | Planned |

---

## Key design principles

**Data at source** — events contain links to data, not the data itself. The source node remains the owner. Receiving nodes retrieve data on demand via a direct HTTPS call. This keeps events lightweight and avoids full data duplication.

**No point-to-point mappings** — adding a new trade partner means spinning up a new node. Both nodes implement the same queue protocol and expose the same data API. The ontology defines what the data means.

**Decouple internal from external** — a node sits in front of the legacy system without replacing it. The legacy system remains the source of truth. The node handles translation and external communication via the semantic adapter.
