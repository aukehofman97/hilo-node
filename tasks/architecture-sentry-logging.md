# Architecture: Production Sentry Logging

**Project**: HILO Node
**Date**: 2026-03-10
**Status**: Approved with changes applied

## Problem Statement

Sentry SDK is initialised but only captures unhandled exceptions automatically. Caught-but-swallowed exceptions lose their traceback, several important operational events go unlogged, one service file (`data.py`) has no logger at all, and there is no node-level context attached to errors. The `/sentry-debug` test endpoint must be removed before production.

## Project Context

- Python 3.12 / FastAPI, running in Docker
- `sentry_sdk.init()` in `main.py` with `enable_logs=True` and `traces_sample_rate=1.0`
- `enable_logs=True` means every `logging.getLogger` call auto-forwards to Sentry — no extra Sentry imports needed in most files
- FastAPI integration auto-captures unhandled exceptions and HTTP transactions

## Proposed Solution

Audit every service and route file against three tiers of signal importance. Add only what is missing: a logger to `data.py`, `capture_exception()` for swallowed errors, node-level Sentry tag set at startup, and removal of the debug endpoint. No new abstractions. No Sentry imports scattered across routes — standard `logging` is the interface everywhere except the two explicit capture calls.

## What Sentry Already Captures (no changes needed)

| Signal | Source | How |
|--------|--------|-----|
| Unhandled exceptions (5xx) | All routes | FastAPI integration |
| HTTP request/response traces | All routes | FastAPI integration |
| `logger.error/warning` in graphdb.py | INSERT/UPDATE/QUERY failures | enable_logs=True |
| `logger.error` for queue publish | events.py line 37 | enable_logs=True — but NO traceback |
| `logger.info` for connection lifecycle | connections.py | enable_logs=True |
| `logger.info` for bridge receive | bridge.py | enable_logs=True |

## Tech Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Logging interface | Standard `logging` module | Decoupled from Sentry; `enable_logs=True` handles forwarding automatically |
| Explicit capture | `sentry_sdk.capture_exception()` only for caught+swallowed exceptions | Preserves full traceback for errors that don't propagate |
| Node context | `sentry_sdk.set_tag("node_id", ...)` once at startup in `main.py` | All errors tagged with node identity without per-request overhead |
| Debug endpoint | Remove `/sentry-debug` from `main.py` | Not production-safe; verification already complete |
| Log levels | `error` for failures, `warning` for degraded-but-recoverable, `info` for lifecycle state changes | Consistent severity → consistent Sentry alert routing |

## Changes Required Per File

### `api/main.py`
- Add `from config import settings` to top-level imports (not currently imported at module level)
- Add `sentry_sdk.set_tag("node_id", settings.node_id)` after `sentry_sdk.init()` — sets node identity on all events
- Remove the `/sentry-debug` route and verify no test references exist

### `api/routes/events.py`
- Add `import sentry_sdk` to top-level imports
- Queue publish failure (line 34–38): add `sentry_sdk.capture_exception(exc)` alongside existing `logger.error` — currently swallowed, Sentry only sees a log line, not the traceback
- Add `logger.info` on successful event creation (event_id, event_type) — important operational signal

### `api/routes/data.py`
- Add `logger = logging.getLogger(__name__)` — only file with no logger
- Add `logger.error` in both exception handlers before raising HTTPException — GraphDB errors will appear in Sentry with context

### `api/routes/connections.py`
- `accept_connection`: add `logger.info` on successful accept (connection_id, peer)
- `reject_connection`: add `logger.info` on successful reject
- Already has good logging elsewhere — no other changes needed

### `api/services/graphdb.py` / `queue.py`
- No changes needed — existing `logger.error` calls sufficient; unhandled re-raises are caught by FastAPI integration

## What We Are NOT Logging

- `GET /events`, `GET /data` — normal read queries; no signal value
- `GET /health` — polling endpoint, would be noise
- Normal 404s (`get_event_by_id` returning `None`) — expected application flow
- `GET /connections` list — read-only, no signal value

## Skill Coverage

| Technology | Skill exists? | Action needed |
|------------|--------------|---------------|
| FastAPI | ✅ api-development | None |
| Sentry SDK | ❌ no dedicated skill | Not needed — changes are minimal and self-contained |

## Open Questions

None — scope is fully bounded by the audit above.

## Next Step

→ Gate 3: Planning skill.
