# Local vs Docker — Hosting Guide

## Overview

The HILO Node can run in two modes:

| Mode | How to start | Best for |
|---|---|---|
| **Local** | Run each process manually | Active development, debugging, hot reload |
| **Docker** | `docker-compose up --build` | Testing the full stack, running Node B, demo |

---

## Key Differences

### 1. Service hostnames

In Docker, services talk to each other by **container name** on the internal `hilo-net` bridge network.
Locally, everything is on `localhost` with explicit ports.

| Setting | Docker value | Local value |
|---|---|---|
| `HILO_GRAPHDB_URL` | `http://graphdb:7200` | `http://localhost:7200` |
| `HILO_RABBITMQ_URL` | `amqp://hilo:hilo@queue:5672/` | `amqp://hilo:hilo@localhost:5672/` |
| `HILO_API_URL` (consumer) | `http://api:8000` | `http://localhost:8000` |

### 2. Persistent data paths

The API generates an RSA key pair and stores a SQLite database. In Docker these land in the `hilo-api-data` named volume mounted at `/data`. Locally that path doesn't exist.

| Setting | Docker default | Local override needed |
|---|---|---|
| `HILO_PRIVATE_KEY_PATH` | `/data/node.key` | `./data/node.key` |
| `HILO_DB_PATH` | `/data/hilo.db` | `./data/hilo.db` |

Create the local directory once:
```bash
mkdir -p api/data
```

### 3. Environment variables

Docker reads them from `docker-compose.yml` + `.env.node-a` / `.env.node-b`.
Locally you set them in your shell or a `.env` file loaded manually.

Minimum set to run the API locally:
```bash
export HILO_GRAPHDB_URL=http://localhost:7200
export HILO_GRAPHDB_REPOSITORY=hilo
export HILO_RABBITMQ_URL=amqp://hilo:hilo@localhost:5672/
export HILO_NODE_ID=node-a
export HILO_NODE_BASE_URL=http://localhost:8000
export HILO_PRIVATE_KEY_PATH=./data/node.key
export HILO_DB_PATH=./data/hilo.db
```

### 4. Python dependencies

Docker installs them via `Dockerfile` (`pip install -r requirements.txt`).
Locally you install them yourself — make sure to re-run after any change to `requirements.txt`:

```bash
cd api
pip install -r requirements.txt
```

V2 added `PyJWT` and `cryptography`. If you get `ModuleNotFoundError: No module named 'jwt'`, run the above.

### 5. Running the consumer

In Docker the consumer is its own container that starts automatically.
Locally it's a separate terminal process:

```bash
cd queue
HILO_RABBITMQ_URL=amqp://hilo:hilo@localhost:5672/ \
HILO_NODE_ID=node-a \
HILO_API_URL=http://localhost:8000 \
python consumer.py
```

### 6. API reload

Locally, run with `--reload` so the server restarts on file changes:
```bash
cd api
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Docker does not use `--reload` (see `api/Dockerfile`).

---

## Quick Fixes Before Building Docker Images

These are the settings most likely to be wrong when moving from local dev to Docker builds:

### HILO_NODE_BASE_URL must be the public address

In `docker-compose.yml` / `.env.node-a`, `NODE_BASE_URL` defaults to `http://localhost:8000`.
This is fine for single-machine testing but **wrong for cross-machine deployments** — the `data_url`
in EventNotifications will point to `localhost` on the source machine, which peers can't reach.

```bash
# .env.node-a — update before any cross-machine demo
NODE_BASE_URL=https://node-a.yourcompany.com
```

### HILO_INTERNAL_KEY should not be "dev" in production

The default internal key (`dev`) bypasses JWT auth for local UI use. Change it before exposing the API:

```bash
# .env.node-a
INTERNAL_KEY=some-long-random-string
```

### Data volume must exist before first boot

The `hilo-api-data` Docker volume is created automatically by docker-compose. Nothing to do here —
but if you ever delete the volume (`docker volume rm`), the RSA key pair and all connection state are
gone and the node gets a new identity. Peer connections will need to be re-established.

### Fuseki vs GraphDB backend

If running locally with Fuseki (the default for local dev):
```bash
HILO_GRAPHDB_BACKEND=fuseki
HILO_GRAPHDB_URL=http://localhost:3030
```

Docker uses GraphDB (Ontotext). The `HILO_GRAPHDB_BACKEND` variable controls which SPARQL
dialect the API uses — make sure it matches the actual triple store you're pointing at.

---

## Running Both Nodes Locally (without Docker)

Start two separate API processes on different ports with different env files:

**Terminal 1 — Node A API:**
```bash
cd api
HILO_NODE_ID=node-a HILO_NODE_BASE_URL=http://localhost:8000 \
HILO_PRIVATE_KEY_PATH=./data/node-a.key HILO_DB_PATH=./data/node-a.db \
uvicorn main:app --port 8000 --reload
```

**Terminal 2 — Node B API:**
```bash
cd api
HILO_NODE_ID=node-b HILO_NODE_BASE_URL=http://localhost:9000 \
HILO_GRAPHDB_REPOSITORY=hilo-b \
HILO_PRIVATE_KEY_PATH=./data/node-b.key HILO_DB_PATH=./data/node-b.db \
uvicorn main:app --port 9000 --reload
```

**Terminal 3 — Node A consumer:**
```bash
cd queue
HILO_NODE_ID=node-a HILO_API_URL=http://localhost:8000 python consumer.py
```

**Terminal 4 — Node B consumer:**
```bash
cd queue
HILO_NODE_ID=node-b HILO_API_URL=http://localhost:9000 python consumer.py
```

**Terminal 5 — UI (points at Node A):**
```bash
cd ui
REACT_APP_API_URL=http://localhost:8000 npm start
```

For a second UI pointing at Node B, run on a different port:
```bash
cd ui
REACT_APP_API_URL=http://localhost:9000 npx vite --port 3001
```

---

## Running Both Nodes in Docker (same machine)

Docker Desktop on macOS/Windows adds `host.docker.internal` to the container's `/etc/hosts`,
resolving to the host machine. This is essential for cross-node forwarding when both nodes
run in separate Docker stacks on the same host.

### The host.docker.internal requirement

Inside Node A's consumer container, `localhost` refers to **the container itself**, not your Mac.
To reach Node B's API (exposed on port 9000 of the host), the consumer must use
`http://host.docker.internal:9000`.

`NODE_BASE_URL` in the `.env` files controls what a node advertises as its reachable address.
For two-node local Docker:

- `.env.node-b` — already set to `NODE_BASE_URL=http://host.docker.internal:9000` ✅
- `.env.node-a` — uncomment `NODE_BASE_URL=http://host.docker.internal:8000` before starting

```bash
# In .env.node-a, change:
NODE_BASE_URL=http://localhost:8000
# to:
NODE_BASE_URL=http://host.docker.internal:8000
```

When this is set, the peer URL you enter in the Connections UI should also use `host.docker.internal`:
```
http://host.docker.internal:9000   ← enter this in Node A's Connections page to connect to Node B
http://host.docker.internal:8000   ← enter this in Node B's Connections page to connect to Node A
```

The browser on your Mac can resolve `host.docker.internal` (Docker Desktop adds it to `/etc/hosts`).

### Starting both nodes

```bash
# Terminal 1 — Node A
docker-compose up --build

# Terminal 2 — Node B (separate project, all ports shifted by +1)
docker-compose -p node-b --env-file .env.node-b up --build
```

Node A services: API :8000, UI :3000, GraphDB :7200, RabbitMQ :5672/:15672
Node B services: API :9000, UI :3001, GraphDB :7201, RabbitMQ :5673/:15673

### Resetting to single-node

When you're done with two-node testing, revert `.env.node-a`:
```bash
# Change back:
NODE_BASE_URL=http://localhost:8000
```

This ensures the Data Explorer and event `data_url` links work correctly in the browser.
