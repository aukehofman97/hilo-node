# E2E Test — Two-Node Cross-Node Event Forwarding

This guide walks through starting both nodes, connecting them, and verifying that events
posted on one node are forwarded to the other.

## Prerequisites

- Docker Desktop running (macOS or Windows)
- Ports 8000, 9000, 3000, 3001, 7200, 7201, 5672, 5673, 15672, 15673 free
- `.env.node-a` has `NODE_BASE_URL=http://host.docker.internal:8000`
- `.env.node-b` has `NODE_BASE_URL=http://host.docker.internal:9000` (default)

If `.env.node-a` still has `NODE_BASE_URL=http://localhost:8000`, change it first.
See `tasks/local-vs-docker.md` — "Running Both Nodes in Docker" for why this matters.

---

## Step 1 — Start both nodes

```bash
# Terminal 1 — Node A
docker-compose up --build

# Terminal 2 — Node B
docker-compose -p node-b --env-file .env.node-b up --build
```

Wait until all healthchecks pass. You'll see:
```
hilo-node-a-api     | INFO: Application startup complete.
hilo-node-b-api     | INFO: Application startup complete.
```

Verify both are healthy:
```bash
curl http://localhost:8000/health   # → {"status":"healthy", ...}
curl http://localhost:9000/health   # → {"status":"healthy", ...}
```

---

## Step 2 — Connect Node A ↔ Node B

You need to send a connection request from one side and accept it on the other.

### From Node A's UI (→ connects to Node B)

1. Open Node A's UI: http://localhost:3000
2. Go to **Connections**
3. Enter `http://host.docker.internal:9000` in the peer URL field
4. Click **Preview** — you should see Node B's identity (`node-b`, `HILO Node B`)
5. Click **Send connection request to HILO Node B**
6. You should see "Request sent — waiting for the peer to accept."

### On Node B's UI (→ accept the request)

1. Open Node B's UI: http://localhost:3001
2. Go to **Connections**
3. You should see a **Pending — incoming** card for `node-a`
4. Click **Accept**

### Verify both sides show Active

- Node A's Connections page: `node-b` shows **Active**
- Node B's Connections page: `node-a` shows **Active**

If Node A shows **Accept pending** instead of Active, the acceptance callback failed.
Click **Resend acceptance** to retry. See `tasks/local-vs-docker.md` if this keeps failing.

---

## Step 3 — Post an event on Node A

```bash
curl -X POST http://localhost:8000/events \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "cargo.arrived",
    "subject": "urn:example:shipment:S001",
    "triples": [
      "<urn:example:shipment:S001> a <urn:example:Shipment> .",
      "<urn:example:shipment:S001> <urn:example:status> \"arrived\" ."
    ]
  }'
```

Expected response: `201 Created` with the stored event.

---

## Step 4 — Verify Node B received the notification

### Check Node B's API logs

In Terminal 2 (Node B's docker-compose output), the consumer should log:
```
hilo-node-b-consumer | Bridge: received event <id> from node-a
```

Or check via the bridge endpoint:
```bash
curl http://localhost:9000/events   # Should show the forwarded event from node-a
```

> **Note:** the bridge stores a notification record (no triples). The full event (triples)
> stays on Node A. Node B stores `data_url = http://host.docker.internal:8000/events/<id>`.

### Retrieve full event from Node B's perspective

Node B can fetch the full event from Node A using a JWT token:

1. Open Node B's UI → Connections → `node-a` (Active)
2. Copy the bearer token from the Token card
3. Fetch the event:

```bash
curl http://localhost:8000/events/<event-id> \
  -H "Authorization: Bearer <token-from-node-b>"
```

Expected: `200 OK` with the full event including triples.

---

## Step 5 — Reverse flow (Node B → Node A)

Repeat Step 3 against Node B:

```bash
curl -X POST http://localhost:9000/events \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "cargo.departed",
    "subject": "urn:example:shipment:S002",
    "triples": [
      "<urn:example:shipment:S002> a <urn:example:Shipment> .",
      "<urn:example:shipment:S002> <urn:example:status> \"departed\" ."
    ]
  }'
```

Check Node A's consumer logs for:
```
hilo-node-a-consumer | Bridge: received event <id> from node-b
```

And verify:
```bash
curl http://localhost:8000/events   # Should include the node-b event
```

---

## Troubleshooting

### Connection stays in "Accept pending"

The acceptance callback from Node A to Node B failed. Causes:
- Node B's `NODE_BASE_URL` is still `http://localhost:9000` (not `host.docker.internal`)
- Node B's API wasn't healthy when the accept was clicked

Fix: update `.env.node-b`, restart Node B (`docker-compose -p node-b down && docker-compose -p node-b --env-file .env.node-b up --build`), and click **Resend acceptance** on Node A.

### Bridge not receiving events

Node A's consumer forwards to `peer_base_url` stored in the connection record. If you
connected before updating `NODE_BASE_URL`, the stored URL is `localhost:9000`, not `host.docker.internal:9000`.

Fix: delete and recreate the connection (reject + reconnect with correct URL set).

### "listConnections failed (404)"

The API process is running old code without the `/connections` endpoint. Restart it:
```bash
docker-compose down && docker-compose up --build
```

### GraphDB repo not found

The `graphdb-init` container creates the repository on first boot. If you see SPARQL errors,
check its logs: `docker-compose logs graphdb-init`. It may have run before GraphDB was ready.
Run it manually: `docker-compose run --rm graphdb-init`.

---

## After testing — reset Node A

When switching back to single-node development, revert `.env.node-a`:
```bash
NODE_BASE_URL=http://localhost:8000
```
