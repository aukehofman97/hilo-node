# Review: Event Receiver Targeting Architecture

**Date**: 2026-03-11
**Artifact**: `tasks/architecture-receiver-targeting.md`
**Reviewer**: Claude Code

---

## Checklist

### Completeness
- [x] Problem statement is clear and specific
- [x] Project context is established
- [x] Every tech choice has a rationale
- [x] Tech choices align with existing stack
- [x] Skill coverage complete
- [ ] No open questions — **gap found (see Critical #1 and #2)**

### Assumptions
- [ ] Backward compatibility of `EventNotification` not addressed
- [ ] Breaking change to `EventCreate` not called out
- [x] Failure mode for offline peer at consume time is handled (log + ACK)
- [ ] `EventResponse` gap not acknowledged

### Over-Engineering
- [x] Solution is minimal — no new infrastructure
- [x] Every decision is justified
- [x] RDF storage of `receiver` is justified by audit trail

---

## Findings

### Critical (must fix before proceeding)

**C1 — `EventResponse` model gap**
The architecture says "show receiver in event list/detail view" but never adds `receiver` to `EventResponse`. The consumer and GraphDB store it, but the API can't return it without this model change. `api/models/events.py` and `api/services/graphdb.py` (`get_event_by_id`, `get_events`) must also expose `receiver: str`.

**C2 — Breaking change to existing tests not called out**
Adding `receiver` as a required field on `EventCreate` breaks every existing test in `api/tests/test_events.py` that POSTs an event without it. The architecture must explicitly name this as a task: update all existing event fixtures to include `receiver`.

**C3 — `EventNotification` deserialization safety**
If `receiver` is added as a required field to `EventNotification` (no default), any queue message without it will raise a `ValidationError` in the consumer — e.g. during a rolling restart where the old API published a message before the new consumer is deployed. Recommend `receiver: str = "all"` as a safe default, so the consumer degrades gracefully to broadcast on legacy messages.

---

### Concerns (should address)

**W1 — Active peer list can go stale between UI render and POST**
The UI fetches active peers to populate the dropdown, but a peer could go inactive by the time the user submits. The API's 422 response is correct, but the UI needs to handle this gracefully — show a clear error message rather than a raw validation failure.

**W2 — RDF datatype not specified for `hilo:receiver`**
Other string properties (`hilo:eventType`, `hilo:sourceNode`) are stored as `xsd:string`. The architecture should explicitly state the same for `hilo:receiver` to stay consistent.

---

### Suggestions (nice to have)

**S1 — Receiver visible in Data Explorer**
Since `hilo:receiver` is stored as an RDF triple, the existing SPARQL query in Data Explorer will automatically include it. No extra work needed, but worth noting as a bonus.

**S2 — UI: empty active-peers state**
If no active connections exist, the dropdown only shows "all". A small note ("No active peers — only broadcast is available") would improve clarity. Not blocking.

---

### What's Solid

- **Fail-fast validation at the API layer** is the right call. Don't store an invalid event.
- **Passing `receiver` through `EventNotification`** avoids a SQLite lookup in the consumer — clean and correct.
- **Log + ACK when a specific peer is offline at consume time** is the right trade-off. The event was valid at POST; the peer's transient state shouldn't dead-letter it.
- **RDF triple storage** provides a real audit trail at zero extra cost.
- **No new infrastructure** — this is a clean extension of existing patterns.

---

## Verdict

**Status**: Approved with changes
**Blocking issues**: C1, C2, C3
**Recommended action**: Fix the three criticals in the architecture doc, then proceed to planning.

### Proposed fixes (do not apply without user approval)

1. Add to "Components Affected":
   - `EventResponse`: add `receiver: str`
   - `graphdb.py` `get_events` / `get_event_by_id`: read `hilo:receiver` triple and populate the field

2. Add explicit task note: "Update all existing `test_events.py` fixtures to include `receiver` field"

3. Change `EventNotification.receiver` to `receiver: str = "all"` in the model definition note
