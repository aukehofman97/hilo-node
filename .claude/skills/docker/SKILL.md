---
name: docker
description: Build and manage Docker containers and docker-compose configurations for the HILO Node. Use when creating Dockerfiles, editing docker-compose.yml, configuring container networking, setting environment variables, debugging container issues, or adding new services. Use when user says "Dockerfile", "docker-compose", "container", "build image", "add service", "container won't start", or "networking between containers". Do NOT use for application code inside containers (use the relevant component skill), or for cloud deployment beyond local Docker (V3 scope).
metadata:
  author: HILO Semantics
  version: 1.0.0
---

# Docker / Containerization

The HILO Node runs as four separate containers orchestrated with docker-compose. One container per component: API, GraphDB, Queue (RabbitMQ), and UI.

## Tech Stack

- **Runtime**: Docker Engine
- **Orchestration**: docker-compose (v3.8+ syntax)
- **Images**: Python 3.12-slim (API), ontotext/graphdb:free (GraphDB), rabbitmq:3-management (Queue), node:20-slim (UI)
- **Networking**: Single Docker bridge network, services communicate by service name

## Architecture

```
docker-compose.yml
├── graphdb     (Ontotext GraphDB Free, port 7200)
├── api         (FastAPI, port 8000, depends on graphdb + queue)
├── queue       (RabbitMQ + management UI, ports 5672 + 15672)
└── ui          (React dev server, port 3000, depends on api)
```

All containers share one bridge network. Services reference each other by name (e.g. the API connects to `http://graphdb:7200`).

## Instructions

### Step 1: Check docker-compose.yml exists

Every change starts here. If it doesn't exist, create it from the template in `references/docker-templates.md`. If it exists, read it before making changes.

### Step 2: One Dockerfile per component

Each component gets its own Dockerfile in its own directory (`api/Dockerfile`, `ui/Dockerfile`, etc.). GraphDB and RabbitMQ use official images directly — no custom Dockerfile needed unless adding config files.

Rules for Dockerfiles:
- Use slim/alpine base images to keep size down
- Copy `requirements.txt` / `package.json` before copying source code (layer caching)
- Never copy `.env` files, `node_modules`, or `__pycache__` into images
- Always include a `.dockerignore` in each component directory

### Step 3: Environment variables

All configuration flows through environment variables defined in docker-compose.yml. Never hardcode connection strings in Dockerfiles or application code.

Naming convention: `HILO_` prefix for all app-specific variables (e.g. `HILO_GRAPHDB_URL`, `HILO_RABBITMQ_URL`).

### Step 4: Startup order

Use `depends_on` with health checks so containers start in the right order:
1. GraphDB starts first (needs time to initialize)
2. RabbitMQ starts (needs time to initialize)
3. API starts after both are healthy
4. UI starts after API is healthy

CRITICAL: `depends_on` alone does not wait for readiness. Use `healthcheck` + `condition: service_healthy` to ensure services are actually ready, not just running.

### Step 5: Verify

After any change: `docker-compose up --build` and check:
- All 4 containers running: `docker-compose ps`
- GraphDB workbench accessible at `http://localhost:7200`
- API docs at `http://localhost:8000/docs`
- RabbitMQ management at `http://localhost:15672`
- UI at `http://localhost:3000`

## Examples

**Example 1: "Set up the initial docker-compose"**

Actions:
1. Create `docker-compose.yml` from template in `references/docker-templates.md`
2. Create `api/Dockerfile` for FastAPI
3. Create `ui/Dockerfile` for React
4. Create `.dockerignore` in each component directory
5. Run `docker-compose up --build`

Result: Four containers running, all accessible on their respective ports.

**Example 2: "Add a volume for GraphDB persistence"**

Actions:
1. Add a named volume `graphdb-data` in docker-compose.yml
2. Mount it to `/opt/graphdb/home` in the graphdb service
3. Run `docker-compose down && docker-compose up`

Result: GraphDB data survives container restarts.

**Example 3: "The API can't connect to GraphDB"**

Actions:
1. Check both containers are on the same network: `docker network inspect`
2. Verify the API uses the service name `graphdb` not `localhost`
3. Check GraphDB is actually ready (healthcheck passing)
4. Check environment variable `HILO_GRAPHDB_URL` matches the GraphDB port

Result: API connects to GraphDB successfully.

## Troubleshooting

**Error: `Connection refused` between containers**
Cause: Using `localhost` instead of the service name. Inside Docker, `localhost` refers to the container itself.
Solution: Use the docker-compose service name (e.g. `http://graphdb:7200`, `amqp://queue:5672`).

**Error: Container exits immediately**
Cause: Application crashes on startup, often due to a missing dependency or failed connection.
Solution: Check logs with `docker-compose logs <service>`. Fix the application error, then rebuild.

**Error: Port already in use**
Cause: Another process or previous container is using the port.
Solution: `docker-compose down` to stop old containers, or change the host port mapping in docker-compose.yml.

**Error: Changes not reflected after rebuild**
Cause: Docker layer caching serving old code.
Solution: `docker-compose up --build --force-recreate` or `docker-compose build --no-cache <service>`.

## References

For the full docker-compose.yml template, Dockerfiles, and healthcheck configurations, see `references/docker-templates.md`.
