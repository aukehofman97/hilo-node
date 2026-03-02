# Architecture: V2 — Two-Tier Events, JWT Auth, Connection Management, Node B

**Project**: HILO Node
**Date**: 2026-03-02
**Status**: Approved with changes applied (2026-03-02)

---

## Problem Statement

V1 proved the single-node architecture works: events are ingested, stored as RDF, exposed via API,
visualised in the UI. V2 has three goals:

1. **Correct the event model** — V1 embeds full RDF triples in the event payload. The architecture
   document specifies "events contain links to data, not the data itself." This must be fixed before
   any inter-node exchange is built, or the wrong pattern becomes load-bearing.

2. **Add authenticated data retrieval** — When a peer node receives a notification and wants the
   full data, it must authenticate. V2 uses RS256 JWTs (asymmetric keys) as the auth mechanism.
   This is the correct shape for V4 (EU Business Wallets / Verifiable Credentials) — the upgrade
   is a key-source change, not a protocol change.

3. **Enable peer connections and Node B** — Nodes must be able to discover each other (via manual
   URL entry), complete a connection handshake (exchange public keys), and then exchange event
   notifications. Node B is the first real peer of Node A.

---

## Project Context

Stack (from CLAUDE.md and existing codebase):
- **API**: Python 3.12, FastAPI, Pydantic, pika
- **Graph store**: Ontotext GraphDB Free (SPARQL endpoint)
- **Queue**: RabbitMQ (AMQP)
- **UI**: React 18, TypeScript, Tailwind CSS, Lucide icons
- **Infrastructure**: Docker, docker-compose

Existing models:
```
EventCreate:   source_node, event_type, triples (Turtle string)
EventResponse: id, source_node, event_type, triples, created_at, links (always empty)
```

---

## Proposed Solution

Three PRs delivered sequentially:

**PR 1 — `feature/two-tier-events-and-connections`**: Backend redesign.
- Split events into notification (travels to peers) and full event (stays on source node).
- Add JWT RS256 auth to `GET /events/{id}`.
- Add connection management: `.well-known/hilo-node` endpoint, connection handshake API,
  SQLite persistence for peer state and public keys.
- Consumer forwards notifications (not full events) to connected peers.

**PR 2 — `feature/connections-ui`**: New "Explore Connections" tab in the UI.
- URL entry → identity card preview → send connection request.
- Accept / reject incoming requests.
- Active peers list with connection status and event count.

**PR 3 — `feature/node-b-setup`**: Spin up Node B and run end-to-end test.
- Node B is the same docker-compose stack on different ports (`.env.node-b` already exists).
- Connect A → B through the UI. POST event on Node A. Verify notification arrives at Node B.
  Node B fetches full data from Node A with JWT. Verify triples stored on Node B.

---

## Tech Decisions

| Decision | Choice | Rationale |
|---|---|---|
| JWT library | `PyJWT >= 2.0` + `cryptography` | Standard, well-maintained, supports RS256. Two lines in requirements.txt. |
| Key algorithm | RS256 (asymmetric) | Node B keeps its private key; only shares public key. No shared secrets between parties. Natural upgrade path: V4 replaces key source (config → DID document) without changing the JWT format or middleware. |
| JWT expiry | `HILO_JWT_EXPIRY_MINUTES` (default: 5) | Configurable. 5 min is standard for service-to-service. Machine-to-machine (consumer): tokens generated programmatically on demand — no UX issue. Human operators: the Connections UI calls `GET /connections/{peer_id}/token` to always display a fresh, valid token with a countdown; the UI auto-regenerates at 30s remaining. Private key never leaves the API container. |
| Key generation | Script on first start (`scripts/generate-keys.sh`) + check in Dockerfile entrypoint | Generates RSA 2048-bit key pair if not present. Private key stored at `HILO_PRIVATE_KEY_PATH` (default: `secrets/node.key`). Public key exposed via `.well-known/hilo-node`. |
| Connection state storage | SQLite (Python built-in `sqlite3`, no new dependency) at `HILO_DB_PATH=/data/hilo.db`, persisted via named Docker volume `hilo-api-data` mounted at `/data` | Connections are a state machine (pending → accepted → active → suspended). SQLite is the right tool — relational state, not a document. No extra Docker service. Volume ensures state survives container restarts. |
| Notification model | New `EventNotification` Pydantic model | Lightweight: `event_id`, `event_type`, `source_node`, `subject` (explicit URI provided by caller), `created_at`, `data_url`. The `data_url` is `{HILO_NODE_BASE_URL}/events/{id}`. |
| `source_node` in EventCreate | Removed — server stamps it from `HILO_NODE_ID` | Callers should not assert their own identity. The node sets this. |
| `GET /events/{id}` auth | Bearer JWT required | Node B includes `Authorization: Bearer <signed-jwt>` when fetching full event data from Node A. Node A verifies signature + expiry + audience. Local UI uses `HILO_INTERNAL_KEY` (a static dev token) or generates its own JWT using the node's own key pair. |
| Consumer forwarding | Consumer reads notification from queue, POSTs to each connected peer's `/bridge/receive` | Retry on delivery failure (already built: 5 retries, dead-letter). Peer list comes from SQLite connection table (status = active). |
| `/.well-known/hilo-node` | New route at this exact path | Industry standard for HTTP-based identity discovery (OpenID Connect Discovery, WebFinger). Base URL is identity. V4: add `did` field alongside `public_key`. |
| Node B | Same docker-compose, `.env.node-b`, `docker-compose -p node-b --env-file .env.node-b up --build` | Already designed in V1. `.env.node-b` exists. No new infrastructure needed. |

---

## Data Model Changes

### EventCreate (POST /events body — from caller)
```
BEFORE: source_node, event_type, triples
AFTER:  event_type, subject, triples
        ← source_node removed (server stamps from HILO_NODE_ID)
        ← subject added: caller explicitly provides the primary RDF subject URI
          e.g. "http://hilo.semantics.io/events/order-001"
          This is a breaking change — existing callers must add subject.
```

### EventNotification (what travels through the queue to peers)
```
NEW MODEL:
  event_id:    str        # Node A's UUID for this event
  event_type:  str        # e.g. "loading_of_goods"
  source_node: str        # stamped by server from HILO_NODE_ID
  subject:     str        # primary RDF subject URI, passed through from EventCreate
  created_at:  datetime
  data_url:    str        # "{HILO_NODE_BASE_URL}/events/{event_id}"
                          # HILO_NODE_BASE_URL must be set to the publicly reachable
                          # address of this node — not optional for cross-node scenarios
```

### EventResponse (unchanged — full event with triples, returned by GET /events/{id})
No change. Still contains full triples. Now protected by JWT auth.

### Connection (new — stored in SQLite)
```
NEW MODEL:
  id:           UUID
  peer_node_id: str       # "node-b"
  peer_name:    str       # "HILO Node B — Warehouse Co."
  peer_base_url: str      # "http://localhost:9000"
  peer_public_key: str    # PEM-encoded RSA public key
  status:       enum      # pending_outgoing | pending_incoming | active | rejected | suspended
  initiated_by: str       # "us" | "them"
  created_at:   datetime
  updated_at:   datetime
```

---

## API Surface Changes

### New endpoints
```
GET  /.well-known/hilo-node              → NodeIdentity (public, no auth)
                                           Exposes node_id, name, base_url, public_key, version.
                                           This is the canonical source for a peer's public key —
                                           always fetched live, never stored after handshake.

GET  /connections                        → list[Connection] (local, no auth)
GET  /connections/{peer_node_id}/token   → { token, expires_at, peer_url }
                                           Generates a fresh RS256 JWT signed with this node's
                                           private key for use against the named peer.
                                           Used by: UI (display + copy), consumer (programmatic).
                                           Private key never leaves the API container.

POST /connections/request                → Connection
                                           Node B calls this on Node A to initiate a connection.
                                           Body: { node_id, name, base_url, public_key }
                                           Node A stores Node B's public key for JWT verification.

POST /connections/{id}/accept            → 200 (operator action, local)
                                           Node A marks connection active, then calls back to
                                           POST {peer_base_url}/connections/accepted with
                                           { node_id, status: "accepted" }. No key in callback —
                                           Node B fetches Node A's key from /.well-known/hilo-node.
                                           If callback fails: retry 3× with backoff, then mark
                                           status "accept_pending". UI shows "Resend acceptance".

POST /connections/accepted               → 200
                                           Callback endpoint. Node A calls this on Node B after
                                           accepting. Node B marks connection active and fetches
                                           Node A's public key from Node A's /.well-known/hilo-node.

POST /connections/{id}/reject            → 204 (operator action, local)
POST /connections/{id}/suspend           → Connection (operator action, local)
```

### Changed endpoints
```
POST /events          — EventCreate adds subject field, removes source_node
GET  /events/{id}     — now requires Authorization: Bearer <jwt>
POST /bridge/receive  — accepts EventNotification (not EventCreate with triples)
                        Intentionally unauthenticated: notifications carry no sensitive data.
                        A forged notification results in a 404 or auth failure on data fetch.
                        V3/V4: sender JWT can be added for stricter verification.
```

### Config additions
```python
node_name: str = "HILO Node"
node_base_url: str = "http://localhost:8000"  # REQUIRED for cross-node: set to public address
private_key_path: str = "/data/node.key"      # RSA private key — in the persisted volume
db_path: str = "/data/hilo.db"                # SQLite — in the persisted volume
jwt_expiry_minutes: int = 5
jwt_audience: str = ""                        # defaults to node_id if empty
internal_key: str = "dev"                     # local UI auth token (dev only)
```

### Docker volume addition (C1)
```yaml
# docker-compose.yml — new named volume
volumes:
  hilo-api-data:          # persists SQLite DB + RSA private key across restarts

# api service — mount the volume
api:
  volumes:
    - hilo-api-data:/data
```

---

## Components Affected

| Component | Change |
|---|---|
| `api/config.py` | Add 5 new settings |
| `api/models/events.py` | Remove `source_node` from `EventCreate`, add `EventNotification` |
| `api/models/connections.py` | **New** — `ConnectionRequest`, `ConnectionResponse`, `NodeIdentity` |
| `api/routes/events.py` | `POST /events` stamps source_node; `GET /events/{id}` adds JWT dep |
| `api/routes/connections.py` | **New** — all connection endpoints + `.well-known` |
| `api/routes/bridge.py` | **New** — `POST /bridge/receive` accepting `EventNotification` |
| `api/services/connections.py` | **New** — SQLite state machine, peer key storage, acceptance callback |
| `api/main.py` | Register new routers |
| `queue/consumer.py` | Forward notifications to connected peers instead of acking without action |
| `ui/src/pages/Connections.tsx` | **New** — Explore Connections page |
| `ui/src/api/connections.ts` | **New** — API client |
| `ui/src/components/TopBar.tsx` | Add "Connections" nav item |
| `ui/src/types.ts` | Add `Connection`, `NodeIdentity` interfaces |
| `api/startup.py` | **New** — generate RSA key pair at `/data/node.key` if absent on startup |
| `api/services/jwt_service.py` | **New** — sign/verify RS256 JWTs, generate key pair on startup if absent |
| `docker-compose.yml` | Add named volume `hilo-api-data`, mount at `/data` in api service |

---

## V4 Upgrade Path

The only code that changes between V2 (RS256 + config-stored keys) and V4 (EU Wallet VCs):

```python
# V2 — api/services/jwt_service.py
def verify_token(token: str, peer_node_id: str) -> dict:
    peer = connections.get_peer(peer_node_id)          # lookup from SQLite
    public_key = peer.public_key                       # stored during handshake
    return jwt.decode(token, public_key, algorithms=["RS256"])

# V4 — same function, different key source
def verify_token(token: str, peer_node_id: str) -> dict:
    did = extract_iss_from_token(token)                # iss = "did:web:node-b.example.com"
    did_document = await resolve_did(did)              # fetch from trust anchor
    public_key = did_document.get_verification_key()  # from DID document
    return jwt.decode(token, public_key, algorithms=["RS256"])
```

No API contract changes. No UI changes. No handshake protocol changes.

The `.well-known/hilo-node` response in V4 adds:
```json
{ "did": "did:web:node-a.company.com" }   // alongside existing public_key field
```

---

## Skill Coverage

| Technology | Skill exists? | Action needed |
|---|---|---|
| FastAPI (new routes, deps) | ✅ api-development | None |
| Pydantic models | ✅ api-development | None |
| RabbitMQ consumer (forwarding) | ✅ async-messaging | None |
| PyJWT + cryptography | ✅ api-development (JWT patterns) | None — standard library usage |
| SQLite (`sqlite3`) | ✅ api-development | None — Python built-in |
| React + Tailwind (Connections page) | ✅ frontend | None |
| Docker (secrets volume, Node B) | ✅ docker | None |
| Git workflow (3 PRs) | ✅ git-workflow | None |

All technologies are covered by existing skills.

---

## Open Questions

None. All decisions resolved in architecture discussion session with user (2026-03-02):
- Broadcast model (no target_node in payload) ✅
- Lazy data fetch (Node B fetches on demand, not eagerly) ✅
- Server stamps source_node (removed from EventCreate) ✅
- Local UI uses internal key (HILO_INTERNAL_KEY=dev) ✅
- Manual URL entry for peer discovery (no registry in V2) ✅
- RS256 asymmetric JWTs (Level 3) ✅
- JWT expiry configurable via HILO_JWT_EXPIRY_MINUTES (default 5) ✅
- SQLite only for connection state (no GraphDB dual-write in V2) ✅
- subject is an explicit field in EventCreate (caller provides primary URI) ✅
- JWT display in UI via GET /connections/{peer}/token endpoint ✅
- Acceptance callback POST /connections/accepted (notification only, no key — key fetched from .well-known) ✅
- /bridge/receive intentionally unauthenticated in V2 ✅

---

## Next Step

→ Gate 3: Run `planning` skill to break this into user stories and tasks.
