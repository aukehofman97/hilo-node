# Review: Plan — Production Sentry Logging

**Date**: 2026-03-10
**Artifacts reviewed**: `tasks/user-stories-sentry.md`, `tasks/todo.md` (Sentry section)

## Planning Review Checklist

### Story Quality
- [x] Every story traces back to `tasks/architecture-sentry-logging.md`
- [x] Every story has ≥2 testable acceptance criteria
- [x] No vague criteria — all are specific and verifiable
- [x] Stories are prioritized (Must/Should)

### Task Quality
- [x] Every task references a parent user story — no orphans
- [x] Tasks are ordered by dependency (main.py first, then routes)
- [x] Each task is achievable in well under 1 session — these are single-line changes
- [ ] **Gap**: T-S8 references `updated.peer_node_id` but `accept_connection` in `connections.py` returns a `ConnectionResponse` — need to verify the field name is actually `peer_node_id` on the model, not `peer_node_id` vs `peer_id` or similar. Low risk but should be confirmed.

### Edge Cases
- [x] US-S2 acceptance criteria cover both the log and the traceback separately
- [ ] **Gap**: US-S4 acceptance criteria don't distinguish between `POST /data` (insert) and `GET /data` (query) failure paths — T-S7 says "both except blocks" but the story doesn't call this out explicitly. Minor ambiguity.
- [x] US-S6 includes a verification step (T-S11) for test/doc references — good

### Cross-Check
- [x] Architecture and plan are consistent — all 4 files from architecture are covered
- [x] Scope matches architecture — nothing added, nothing missed
- [x] Feasible — 11 tasks, all single-line or two-line edits, one session easily

---

## Findings

### Critical
- None

### Concerns

1. **T-S8 field name unverified**: `updated.peer_node_id` — the `ConnectionResponse` model field name hasn't been confirmed. If the field is named differently (e.g. `peer_id`), the log line will raise an `AttributeError` at runtime. Should verify against `models/connections.py` before implementing T-S8.

2. **T-S7 log message is generic**: `"GraphDB error: %s", exc` — acceptable, but `data.py` has two different operations (insert vs query). Slightly more descriptive messages (`"GraphDB insert failed"` / `"GraphDB query failed"`) would make Sentry grouping cleaner. Not a blocker.

### Suggestions

1. After implementation, rebuild and redeploy the Docker image (`docker-compose build api && docker-compose up -d api`) as a final verification step. Could be captured as a final T-S12 verification task.

### What's Solid

- Story-to-task traceability is clean — every task has a parent, every story has tasks.
- Scope discipline is excellent: 11 tasks, all surgical, no scope creep.
- T-S11 (verify no test references to `/sentry-debug`) shows the right level of care for removals.
- Must/Should prioritisation is correct — the debug endpoint removal and traceback capture are Must; audit trail logging is Should.

---

## Verdict

**Status**: Approved with changes
**Blocking issues**: None — concerns are pre-implementation checks, not plan gaps
**Recommended action**:
- Before implementing T-S8, verify `ConnectionResponse` field name in `models/connections.py`
- Optionally improve T-S7 log messages to distinguish insert vs query
- Then proceed to implementation
