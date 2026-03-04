# User Stories — V2: Two-Tier Events, JWT Auth, Connections, Node B

**Architecture ref**: `tasks/architecture.md`
**Date**: 2026-03-02

---

## PR 1 — feature/two-tier-events-and-connections (Backend)

---

### US-1: Two-tier event model

**As a** node operator
**I want** full RDF triples to stay on the source node and only a lightweight notification to travel to peers
**So that** data stays at source, inter-node events are small, and the architecture matches the "data at source" principle

**Acceptance criteria:**
- [ ] `POST /events` accepts `event_type`, `subject`, `triples` (no `source_node` — server stamps it)
- [ ] Posting an event stores full triples in GraphDB and publishes an `EventNotification` to the queue (not the full event)
- [ ] `EventNotification` contains: `event_id`, `event_type`, `source_node`, `subject`, `created_at`, `data_url`
- [ ] `data_url` resolves to `{HILO_NODE_BASE_URL}/events/{event_id}`
- [ ] `GET /events` and `GET /events/{id}` still return the full `EventResponse` (with triples) to local callers

**Linked tasks:** T-05, T-10, T-13, T-17
**Architecture ref:** Data Model Changes — EventCreate, EventNotification
**Priority:** Must

---

### US-2: JWT-authenticated data retrieval

**As a** peer node (Node B)
**I want** to present a signed JWT when calling `GET /events/{id}` on Node A
**So that** only nodes Node A has trusted can retrieve full event data

**Acceptance criteria:**
- [ ] `GET /events/{id}` without an `Authorization` header returns `401 Unauthorized`
- [ ] `GET /events/{id}` with a valid RS256 JWT (correct issuer, audience, not expired) returns `200` with full `EventResponse`
- [ ] `GET /events/{id}` with an expired JWT returns `401`
- [ ] `GET /events/{id}` with a JWT signed by an unknown key returns `401`
- [ ] `GET /events/{id}` with `HILO_INTERNAL_KEY` bearer token returns `200` (local UI bypass)

**Linked tasks:** T-03, T-07, T-10, T-15, T-18
**Architecture ref:** Tech Decisions — JWT expiry; API Surface — Changed endpoints
**Priority:** Must

---

### US-3: RSA key pair generated and persisted on startup

**As a** node
**I want** an RSA key pair generated automatically on first boot and persisted across restarts
**So that** I have a stable identity for JWT signing without manual key management

**Acceptance criteria:**
- [ ] On first boot, if `/data/node.key` does not exist, an RSA-2048 key pair is generated and saved
- [ ] On subsequent boots, the existing key is loaded (not regenerated)
- [ ] The public key is returned by `GET /.well-known/hilo-node` in PEM format
- [ ] Container restart does not change the key pair (volume persists it)

**Linked tasks:** T-02, T-03, T-04, T-09, T-19
**Architecture ref:** Tech Decisions — Key generation; Docker volume addition
**Priority:** Must

---

### US-4: Initiate a peer connection

**As a** node operator on Node B
**I want** to send a connection request to Node A by calling its `/connections/request` endpoint
**So that** Node A can review and accept the request to establish a trusted relationship

**Acceptance criteria:**
- [ ] `POST /connections/request` on Node A with `{node_id, name, base_url, public_key}` returns `201` and stores the request as `pending_incoming`
- [ ] Node A stores Node B's public key in SQLite for future JWT verification
- [ ] Duplicate request from the same `node_id` returns `409 Conflict`
- [ ] `GET /connections` on Node A shows the pending request with status `pending_incoming`
- [ ] `GET /.well-known/hilo-node` returns the correct `NodeIdentity` for Node A

**Linked tasks:** T-06, T-08, T-09, T-11, T-16, T-20
**Architecture ref:** API Surface — New endpoints (/connections/request, /.well-known)
**Priority:** Must

---

### US-5: Accept or reject a connection request

**As a** node operator on Node A
**I want** to accept or reject an incoming connection request
**So that** I control which nodes are authorised to request data from mine

**Acceptance criteria:**
- [ ] `POST /connections/{id}/accept` marks the connection `active` in SQLite
- [ ] After accept, Node A calls `POST /connections/accepted` on Node B with `{node_id: "node-a", status: "accepted"}`
- [ ] If the callback to Node B fails after 3 retries, connection status on Node A becomes `accept_pending`
- [ ] `POST /connections/{id}/reject` marks the connection `rejected` and returns `204`
- [ ] A rejected connection cannot be accepted afterwards (returns `400`)

**Linked tasks:** T-08, T-11, T-20
**Architecture ref:** API Surface — POST /connections/{id}/accept, POST /connections/{id}/reject
**Priority:** Must

---

### US-6: Complete the connection on Node B's side

**As** Node B
**I want** to receive an acceptance callback from Node A and retrieve Node A's public key
**So that** I can sign JWTs that Node A will accept and verify Node A's identity

**Acceptance criteria:**
- [ ] `POST /connections/accepted` on Node B (called by Node A) marks the connection `active` in Node B's SQLite
- [ ] Upon receiving the callback, Node B fetches Node A's public key from `GET {node_a_base_url}/.well-known/hilo-node` and stores it
- [ ] `GET /connections` on Node B shows Node A as an active peer with `peer_public_key` populated
- [ ] If the `.well-known` fetch fails, Node B marks the connection `active` but logs a warning; public key can be refreshed manually

**Linked tasks:** T-08, T-11, T-20
**Architecture ref:** API Surface — POST /connections/accepted
**Priority:** Must

---

### US-7: Get a fresh JWT for a connected peer

**As a** node operator or automated consumer
**I want** to call `GET /connections/{peer_node_id}/token` and receive a fresh signed JWT
**So that** I can authenticate data retrieval requests to that peer without managing key signing myself

**Acceptance criteria:**
- [ ] `GET /connections/{peer_node_id}/token` returns `{token, expires_at, peer_url}`
- [ ] The token is a valid RS256 JWT signed with this node's private key, with `iss = node_id`, `aud = peer_node_id`, `exp = now + HILO_JWT_EXPIRY_MINUTES`
- [ ] Calling the endpoint when the peer is not an active connection returns `404`
- [ ] The returned token is accepted by the peer's `GET /events/{id}` endpoint

**Linked tasks:** T-07, T-11, T-21
**Architecture ref:** Tech Decisions — JWT expiry; API Surface — GET /connections/{peer}/token
**Priority:** Must

---

### US-8: Consumer forwards notifications to connected peers

**As** Node A
**I want** the queue consumer to forward event notifications to all active connected peers after processing
**So that** peers are informed of new events without receiving the full RDF data

**Acceptance criteria:**
- [ ] After a new event is consumed, the consumer POSTs the `EventNotification` to each active peer's `POST /bridge/receive`
- [ ] If a peer's `/bridge/receive` returns a non-2xx or times out, the consumer retries 3× with exponential backoff
- [ ] If all retries fail, the message moves to the dead-letter queue
- [ ] `POST /bridge/receive` stores the notification in GraphDB and returns `200` without re-forwarding it
- [ ] `POST /bridge/receive` is unauthenticated (notifications carry no sensitive data)

**Linked tasks:** T-12, T-13, T-14, T-22
**Architecture ref:** API Surface — POST /bridge/receive; Tech Decisions — Consumer forwarding
**Priority:** Must

---

## PR 2 — feature/connections-ui (UI)

---

### US-9: Add a peer connection from the UI

**As a** node operator
**I want** to enter a peer's URL in the "Connections" tab, preview their identity, and send a connection request
**So that** I can establish peer relationships without touching the API directly

**Acceptance criteria:**
- [ ] A "Connections" nav item exists in the navigation bar and navigates to the Connections page
- [ ] Entering a URL and clicking "Preview" fetches `/.well-known/hilo-node` and displays the peer's `node_id`, `name`, `base_url`, and capabilities
- [ ] If the URL is unreachable or returns non-JSON, an error message is shown (no crash)
- [ ] Clicking "Send request" calls `POST /connections/request` on the target node and shows the pending outgoing request in the UI

**Linked tasks:** T-24, T-25, T-26, T-27, T-28, T-29
**Architecture ref:** Components Affected — ui/src/pages/Connections.tsx
**Priority:** Must

---

### US-10: Review and act on incoming connection requests

**As a** node operator
**I want** to see pending incoming connection requests and accept or reject them from the UI
**So that** I manage peer access without needing to call the API manually

**Acceptance criteria:**
- [ ] The Connections page shows a "Pending — incoming" section listing requests with `node_id`, `name`, `base_url`
- [ ] Clicking "Accept" calls `POST /connections/{id}/accept` and moves the peer to the active section
- [ ] Clicking "Reject" calls `POST /connections/{id}/reject` and removes the request from the list
- [ ] If the acceptance callback to the peer fails (`accept_pending` status), the UI shows a "Resend acceptance" button

**Linked tasks:** T-25, T-27, T-30
**Architecture ref:** API Surface — POST /connections/{id}/accept, POST /connections/{id}/reject
**Priority:** Must

---

### US-11: View active peers and use their access token

**As a** node operator
**I want** to see all active peers with a live Bearer token displayed
**So that** I can copy the token for manual data queries and always have a valid one ready

**Acceptance criteria:**
- [ ] The Connections page shows an "Active peers" section with `node_id`, `name`, `base_url`, connection date, and event count
- [ ] Each active peer card shows a Bearer token fetched from `GET /connections/{peer}/token`
- [ ] The token displays a "valid for X:XX" countdown; at 30 seconds remaining the token is auto-refreshed
- [ ] A copy button copies the token to the clipboard
- [ ] The peer's public key is visible (fetched from peer's `/.well-known/hilo-node`) with a "Refresh key" button

**Linked tasks:** T-25, T-27, T-30, T-31
**Architecture ref:** Tech Decisions — JWT expiry (UI display)
**Priority:** Must

---

## PR 3 — feature/node-b-setup (Infrastructure + E2E)

---

### US-12: Run Node B on the same machine

**As a** developer
**I want** to start Node B with `docker-compose -p node-b --env-file .env.node-b up --build`
**So that** I have two independent, fully functional nodes running simultaneously on one machine

**Acceptance criteria:**
- [ ] All Node B containers start healthy (graphdb, queue, api, consumer, ui)
- [ ] Node B services are accessible at the expected ports: API :9000, UI :3001, GraphDB :7201, RabbitMQ :5673/:15673
- [ ] `GET http://localhost:9000/.well-known/hilo-node` returns `{node_id: "node-b", ...}`
- [ ] Node A and Node B have separate GraphDB repositories and separate RabbitMQ queues (no shared state)

**Linked tasks:** T-33, T-34
**Architecture ref:** Tech Decisions — Node B; Proposed Solution — PR 3
**Priority:** Must

---

### US-13: End-to-end inter-node event exchange

**As a** developer
**I want** to send an event from Node A and have Node B receive the notification and retrieve the full data
**So that** I can prove the complete V2 architecture works across two nodes

**Acceptance criteria:**
- [ ] Node A and Node B are connected (active peer relationship in both nodes' Connections tabs)
- [ ] `POST http://localhost:8000/events` with a valid payload → Node A stores triples in GraphDB, forwards notification to Node B
- [ ] Node B's `POST /bridge/receive` logs receipt of the notification
- [ ] `GET http://localhost:8000/events/{id}` with a JWT obtained from Node B's Connections tab → returns full `EventResponse` with triples
- [ ] `POST http://localhost:9000/events` → notification arrives at Node A (reverse flow works)
- [ ] Node A's Events page shows events from both `node-a` and `node-b`

**Linked tasks:** T-35, T-36, T-37, T-38, T-39
**Architecture ref:** Proposed Solution — PR 3; V4 Upgrade Path
**Priority:** Must

---

## feature/local-event-import

---

### US-14: "Store locally" button appears after fetching remote triples

**As a** node operator on Node B
**I want** a "Store locally" button to appear in the event detail panel after I fetch full triples from the source node
**So that** I can explicitly choose whether to persist the data — fetch and import are separate decisions

**Acceptance criteria:**
- [ ] After `handleFetchFromSource` completes with non-empty `detail.triples`, a "Store locally" button is visible in the detail panel
- [ ] If `detail.has_local_copy === true` (already imported), the button does not appear
- [ ] When `selectedId` changes (user opens a different event), `stored` state resets so the button returns to its initial condition
- [ ] The button is disabled during the store operation and shows a loading indicator

**Linked tasks:** T-40, T-45
**Architecture ref:** Tech Decisions — Store trigger; Endpoint Design — button visibility rule
**Priority:** Must

---

### US-15: Import fetched triples into the local triple store

**As a** node operator on Node B
**I want** clicking "Store locally" to persist the fetched triples to my local Fuseki dataset
**So that** I can query and explore peer event data via SPARQL and the Data Explorer without the source node being available

**Acceptance criteria:**
- [ ] `POST /events/{id}/import` with `{triples: "..."}` and `Bearer dev` header returns `200` with `{status: "imported", id: "..."}`
- [ ] After import, the event in Fuseki has `hilo:triplesPayload` added to the existing event subject; `hilo:dataUrl` is preserved
- [ ] After import, the actual RDF triples are in the Fuseki dataset and returnable by SPARQL SELECT
- [ ] `POST /events/{id}/import` on a non-existent event returns `404`
- [ ] `POST /events/{id}/import` on a locally-originated event (no `hilo:dataUrl`) returns `400`
- [ ] `POST /events/{id}/import` on an event that is already imported returns `409`
- [ ] If the first write (triples insert) succeeds but the second write (metadata update) fails, the event still shows as `received` (not `imported`) so the user can retry

**Linked tasks:** T-41, T-42, T-43, T-44, T-45, T-46
**Architecture ref:** Endpoint Design; Tech Decisions — Write order; Components Affected
**Priority:** Must

---

### US-16: "imported" status badge for locally-stored peer events

**As a** node operator
**I want** peer events that have been imported to show a distinct "imported" badge (green) in both the event list and detail panel
**So that** I can see at a glance which peer events are available locally versus only as notifications

**Acceptance criteria:**
- [ ] Events originated on this node show `published` badge (purple)
- [ ] Events received from peers that have NOT been imported show `received` badge (blue)
- [ ] Events received from peers that HAVE been imported show `imported` badge (green)
- [ ] Badge derivation uses `source_node !== localNodeId && event.has_local_copy` — no hardcoded node names
- [ ] After a successful import in the detail panel, the badge updates in both the detail panel and the event list row without a full page reload

**Linked tasks:** T-41, T-42, T-43, T-45
**Architecture ref:** Status Badge Derivation table; Tech Decisions — `has_local_copy: bool`
**Priority:** Must
