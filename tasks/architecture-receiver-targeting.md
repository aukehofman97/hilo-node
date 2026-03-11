# Architecture: Event Receiver Targeting

**Project**: HILO Node
**Date**: 2026-03-11
**Status**: Approved

---

## Problem Statement

Currently, every posted event is broadcast to all active peers — there is no way to target a specific peer. The `receiver` field adds explicit intent: an event must declare who should receive it (`"all"` for broadcast, or a specific `peer_node_id` for unicast). This makes routing intentional rather than implicit.

---

## Project Context

- **Backend**: FastAPI + Pydantic (Python 3.12)
- **Queue**: RabbitMQ via `pika`; consumer is a separate Docker service (`queue/consumer.py`)
- **Graph store**: GraphDB; events stored as RDF triples — `receiver` is routing metadata, NOT event data, so it is not stored as a triple
- **Connections**: SQLite (`connections` table); `peer_node_id` is the canonical peer identifier
- **Frontend**: React + TypeScript; events posted via the Events page

Current event flow:
```
POST /events → store in GraphDB → publish EventNotification to RabbitMQ
  → consumer fetches ALL active peers → forwards to each
```

---

## Proposed Solution

Add a required `receiver` field to `EventCreate`. The API validates it at POST time (must be `"all"` or an exact `peer_node_id` matching an active connection in SQLite), then passes it through `EventNotification` into the queue. The consumer reads `receiver` and filters its peer list accordingly. `receiver` is purely a routing concern — it is not stored as an RDF triple or returned on GET endpoints.

---

## Tech Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Validation key | `peer_node_id` (not `peer_name`) | `peer_node_id` is the canonical unique identifier in the connections table; `peer_name` is human-readable only and not guaranteed unique |
| Validation layer | API route at POST time | Fail fast before storing; SQLite lookup is cheap; 422 is informative |
| Receiver in queue | Add `receiver: str` to `EventNotification` (no default) | Consumer already decodes JSON body; explicit error if missing — no silent broadcast |
| No RDF storage | `receiver` not stored as a triple | It is routing metadata, not event content; its purpose is fulfilled once the consumer routes the message |
| Consumer offline-peer handling | Log warning + ACK | Peer offline after a valid POST is transient; dead-lettering would be misleading |
| `"all"` with zero peers | Allow — consumer logs "no active peers" | Posting intent is valid regardless of current peer count |

---

## Components Affected

### `api/models/events.py`
- `EventCreate`: add `receiver: str` (required)
- `EventNotification`: add `receiver: str` (required, no default)

### `api/routes/events.py`
- `create_event`: validate `receiver` before storing
  - `"all"` → always valid
  - anything else → must exactly match a `peer_node_id` with `status = "active"` in SQLite → 422 if not found or not active
- Pass `receiver` into `EventNotification`

### `queue/consumer.py`
- `process_notification`: read `receiver` from notification body
  - `"all"` → forward to all active peers (unchanged behavior)
  - `{peer_node_id}` → filter peer list to that one peer; log warning if peer not found at consume time; still ACK

### `ui/src/pages/Events.tsx`
- Add `receiver` dropdown to the "Post Event" form
  - Value submitted: `peer_node_id` (exact match required by the API)
  - Label shown: `peer_name` (human-readable)
  - Options: `"all"` (broadcast) + one entry per active connection
  - Fetch from `GET /connections`, filter client-side to `status = "active"`
- Handle 422 gracefully — show a clear error if the peer went inactive between render and submit

### `api/tests/test_events.py`
- Update all existing event fixtures to include `receiver` field (breaking change — required field added)

---

## Validation Rules

| Input | Outcome |
|-------|---------|
| `receiver` missing | 422 — field required |
| `receiver = "all"` | ✅ valid — broadcast to all active peers |
| `receiver = <active peer_node_id>` | ✅ valid — unicast to that peer |
| `receiver = <inactive/pending peer_node_id>` | 422 — peer not active |
| `receiver = <peer_name or unknown string>` | 422 — peer not found |

---

## Skill Coverage

| Technology | Skill exists? | Action needed |
|------------|--------------|---------------|
| FastAPI / Pydantic | ✅ api-development | None |
| RabbitMQ / pika | ✅ async-messaging | None |
| React / TypeScript | ✅ frontend-design | None |

---

## Open Questions

None.

---

## Next Step

→ Planning skill.
