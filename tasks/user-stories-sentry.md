# User Stories: Production Sentry Logging

**Architecture ref**: `tasks/architecture-sentry-logging.md`

---

### US-S1: Node identity on all Sentry events

**As an** operator
**I want** every Sentry error and log to be tagged with the node_id
**So that** I can filter and group issues by node in the Sentry dashboard

**Acceptance criteria:**
- [ ] All Sentry events include a `node_id` tag matching `settings.node_id`
- [ ] The tag is set once at startup — not per-request

**Linked tasks:** T-S1, T-S2
**Architecture ref:** Changes Required — `api/main.py`
**Priority:** Must

---

### US-S2: Full traceback for queue publish failures

**As an** operator
**I want** queue publish failures to appear in Sentry with a full exception traceback
**So that** I can diagnose RabbitMQ connectivity issues without reading raw container logs

**Acceptance criteria:**
- [ ] A queue publish failure produces a Sentry error event with exception type, message, and stacktrace
- [ ] The existing `logger.error` log line is preserved alongside the capture

**Linked tasks:** T-S3, T-S4
**Architecture ref:** Changes Required — `api/routes/events.py`
**Priority:** Must

---

### US-S3: Operational audit trail for event creation

**As an** operator
**I want** successful event creations logged at INFO level
**So that** I have an audit trail of events created through the API

**Acceptance criteria:**
- [ ] A `logger.info` line is emitted for every successful `POST /events`, including event_id and event_type
- [ ] The log appears in Sentry as a breadcrumb/log entry

**Linked tasks:** T-S5
**Architecture ref:** Changes Required — `api/routes/events.py`
**Priority:** Should

---

### US-S4: GraphDB errors visible in Sentry from data routes

**As an** operator
**I want** GraphDB failures in `POST /data` and `GET /data` to appear in Sentry with context
**So that** data pipeline errors are surfaced without me needing to grep container logs

**Acceptance criteria:**
- [ ] A `logger.error` is emitted before any HTTPException(500) is raised in `data.py`
- [ ] The log message includes the exception detail
- [ ] The log appears in Sentry as a log entry under the failing request trace

**Linked tasks:** T-S6, T-S7
**Architecture ref:** Changes Required — `api/routes/data.py`
**Priority:** Must

---

### US-S5: Connection lifecycle state changes logged

**As an** operator
**I want** accept and reject actions on connections to be logged at INFO level
**So that** I have a record of operator decisions in Sentry

**Acceptance criteria:**
- [ ] A `logger.info` is emitted when a connection is successfully accepted (includes connection_id and peer_node_id)
- [ ] A `logger.info` is emitted when a connection is successfully rejected (includes connection_id)

**Linked tasks:** T-S8, T-S9
**Architecture ref:** Changes Required — `api/routes/connections.py`
**Priority:** Should

---

### US-S6: Debug endpoint removed

**As an** operator
**I want** the `/sentry-debug` route removed from the production API
**So that** the API surface does not expose a route that intentionally crashes the server

**Acceptance criteria:**
- [ ] `GET /sentry-debug` returns 404
- [ ] No reference to the route exists in tests or documentation

**Linked tasks:** T-S10, T-S11
**Architecture ref:** Changes Required — `api/main.py`
**Priority:** Must
