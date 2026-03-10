# Pre-Production Checklist

Items that MUST be resolved before HILO Node goes into production or becomes a public/shared repository.

---

## 🔴 P0 — Critical (blockers)

### ENV-1: Gitignore real env files and purge from history
**Why:** `INTERNAL_KEY` is committed in `.env.node-a` / `.env.node-b` — in git history permanently.
**Fix:**
1. Flip `.gitignore`: remove `!.env.node-*`, allow only `.env.node-*.example`
2. Create `.env.node-a.example` and `.env.node-b.example` with placeholder values
3. Purge from history: `git filter-repo --path .env.node-a --invert-paths`
4. Force-push cleaned history, then rotate `INTERNAL_KEY`

### ENV-2: Rotate INTERNAL_KEY after ENV-1
**Why:** Current key is in git history — treat as compromised once purged.
**Fix:** `openssl rand -hex 32`, update env files, restart API containers.

### ~~MON-1: Add Sentry (error tracking)~~ ✅ Done (2026-03-10)
**Resolved:** `sentry-sdk==2.54.0` installed, initialised in `main.py` with node_id tag, `capture_exception` on swallowed errors, structured logging across all routes, Sentry disabled during test runs. Slack alert channel configured.
**Remaining scope:** UI Sentry browser SDK not yet added.

### SEC-1: Missing request size limits
**Why:** FastAPI accepts unlimited payload sizes — a large `triples` POST can exhaust memory.
**Fix:** Add `ContentSizeLimitMiddleware` or set `max_body_size` in the FastAPI app (`main.py:20`).

### SEC-2: SPARQL injection via raw query endpoint
**Why:** `GET /data?sparql=` passes raw SPARQL directly to GraphDB with no sanitisation (`data.py:20`).
**Fix:** Validate SPARQL syntax before execution, or restrict to read-only SELECT queries only.

### DOCKER-1: Missing resource limits on all containers
**Why:** No `mem_limit` or `cpus` — a runaway GraphDB query can consume all host RAM and crash the machine.
**Fix:** Add `deploy.resources.limits` (mem, cpu) to each service in `docker-compose.yml`.

---

## 🟠 P1 — High (fix before first real users)

### MON-2: Add Grafana + Prometheus (metrics)
**Why:** No visibility into API latency, queue depth, GraphDB performance, or container resource usage.
**Fix:** Add `prometheus` and `grafana` services to `docker-compose.yml`. Expose `/metrics` from FastAPI via `prometheus-fastapi-instrumentator`. RabbitMQ already exposes metrics — wire to Prometheus.

### SEC-3: Restrict CORS origins
**Why:** `allow_origins=["*"]` means any website can call the API (`main.py:30`).
**Fix:** Add `HILO_CORS_ORIGINS` env var, restrict to known UI origin in production.

### SEC-4: SPARQL injection via f-string interpolation in graphdb.py
**Why:** `since`, `event_type`, and `event_id` are interpolated directly into SPARQL queries (`graphdb.py:203–303`).
**Fix:** Escape or validate all user-supplied values before interpolation.

### SEC-5: Health endpoint returns 200 even when degraded
**Why:** Container orchestrators check HTTP status — a degraded service returning 200 won't trigger restarts (`health.py:8`).
**Fix:** Return 503 when `status != "healthy"`.

### SEC-6: Unauthenticated /connections list
**Why:** `GET /connections` is public — exposes full peer topology to anyone (`connections.py:71`).
**Fix:** Add `Depends(require_jwt)`.

### DOCKER-2: Consumer service has no healthcheck
**Why:** If the consumer crashes, Docker won't restart it — messages pile up in the queue silently.
**Fix:** Add a healthcheck to the `consumer` service in `docker-compose.yml`.

### DOCKER-3: GraphDB init failure not handled
**Why:** If `graphdb-init` fails (GraphDB not ready), it exits silently and the API starts with no repository (`docker-compose.yml:49`).
**Fix:** Add retry logic to `graphdb-init` or fail the entire stack.

### API-1: Event creation is not atomic
**Why:** `store_event()` succeeds but `publish_notification()` can fail — event is stored but never forwarded to peers (`events.py:17`).
**Fix:** Wrap in try/except; either roll back or add the notification to a retry queue.

### API-2: No error boundary in React UI
**Why:** Any unhandled exception crashes the entire UI to a blank screen (`App.tsx:43`).
**Fix:** Add a top-level React `ErrorBoundary` component.

### API-3: Unhandled promise rejections in Events page
**Why:** Failed fetches cause infinite loading spinners with no user feedback (`Events.tsx:606`).
**Fix:** Add explicit error state and user-facing error messages.

### API-4: SQLite has no connection pooling
**Why:** Every DB call opens a fresh connection — under load, SQLite serialises writes and causes 500 errors (`connections.py:54`).
**Fix:** Use a connection pool (e.g. SQLAlchemy with pool size) or migrate to Postgres for production.

---

## 🟡 P2 — Medium (fix before scaling)

### OPS-1: Cloudflared container has no healthcheck
**Why:** If the tunnel drops, Docker won't restart it. Tunnel health is not monitored.
**Fix:** Add healthcheck polling `localhost:20241/metrics`.

### OPS-2: Log rotation
**Why:** Unbounded container logs will fill disk over time.
**Fix:** Add `logging: driver: json-file, options: {max-size: "10m", max-file: "3"}` to all services in `docker-compose.yml`.

### OPS-3: GraphDB backup
**Why:** Event data lives in GraphDB — no backup means data loss on volume failure.
**Fix:** Scheduled Turtle dump from the `hilo` repository, stored off-machine.

### SEC-7: Dead-letter queue messages are never retried
**Why:** Failed notifications go to `hilo.events.dead` with no consumer — permanent silent data loss (`consumer.py:17`).
**Fix:** Implement DLQ inspector endpoint or admin replay mechanism.

### SEC-8: No circuit breaker for peer forwarding
**Why:** Every message retries 3 times against an offline peer, blocking the consumer thread (`consumer.py:70`).
**Fix:** Circuit breaker that backs off from consistently unreachable peers.

### SEC-9: No Turtle validation before insert
**Why:** Malformed RDF is sent to GraphDB without syntax check, causing silent data quality issues (`graphdb.py:121`).
**Fix:** Validate with RDFLib before inserting.

### SEC-10: Consumer doesn't validate incoming message structure
**Why:** Malformed queue messages cause KeyError/AttributeError and crash the consumer callback (`consumer.py:103`).
**Fix:** Wrap parsing in Pydantic `EventNotification` model with try/except.

### SEC-11: Weak default internal_key
**Why:** `internal_key` defaults to `"dev"` in `config.py:19` — if `HILO_INTERNAL_KEY` is missing in production, the default is silently used.
**Fix:** Add startup validation that rejects `"dev"` as the key value in non-development environments.

### CONFIG-1: Missing config validation on startup
**Why:** Silent misconfigurations (wrong `node_id`, missing private key, unreachable RabbitMQ) cause confusing runtime failures.
**Fix:** Add a startup check that validates required settings are present and services are reachable before accepting traffic.

### HARD-CODED-1: Queue name hardcoded in rabbitmq_management.py
**Why:** `MAIN_QUEUE = "hilo.events.node-a"` is hardcoded — breaks if `NODE_ID` changes (`rabbitmq_management.py:9`).
**Fix:** Derive from `settings.node_id`.

---

## 🟢 P3 — Nice to have (polish)

### UI-1: Remove `|| "dev"` fallback from events.ts
**Why:** Once ENV-1 is done, this fallback masks misconfiguration silently.
**Fix:** Remove fallback, fail loudly if `VITE_INTERNAL_KEY` is missing.

### API-5: Add request logging middleware
**Why:** No HTTP access log (method, path, status, latency) makes production debugging hard.
**Fix:** Add a logging middleware to `main.py`.

### UI-2: Add fetch timeout (AbortController)
**Why:** If the API hangs, `fetchEvents()` has no timeout — UI spins indefinitely (`Events.tsx:606`).
**Fix:** Wrap all fetch calls with `AbortController` and a 10s timeout.

### SEC-12: Add sender JWT verification to /bridge/receive
**Why:** Currently unauthenticated — a forged notification can pollute the event log.
**Fix:** V3/V4 scope — verify sender JWT on bridge receive (noted in bridge.py comments).

---

*Last updated: 2026-03-10*
