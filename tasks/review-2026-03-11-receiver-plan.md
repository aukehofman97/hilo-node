# Review: Event Receiver Targeting — Plan

**Date**: 2026-03-11
**Artifacts**: `tasks/user-stories-receiver-targeting.md`, `tasks/todo.md` (T-67–T-78)
**Reviewer**: Claude Code

---

## Checklist

### Story Quality
- [x] Every story traces to architecture
- [x] Every story has ≥2 testable acceptance criteria
- [x] No vague criteria
- [x] All three stories are Priority: Must — correct given feature is breaking change

### Task Quality
- [x] Every task references a user story — no orphans
- [x] Tasks ordered by dependency (models → validation → consumer → tests → UI → verify)
- [x] Each task is achievable in ≤1 session
- [ ] T-73 consumer test location unresolved — see Critical #1

### Edge Cases
- [x] Missing receiver → T-72 covers 422
- [x] Unknown/inactive receiver → T-72 covers 422
- [x] Peer offline at consume time → T-70 + T-73 cover warning + ACK
- [ ] `receiver="all"` with zero active peers not explicitly in T-73 test cases — see Concern #1

### Cross-Check
- [x] Architecture and plan are consistent
- [x] Scope matches architecture — nothing added, nothing missed
- [x] No contradictions between stories and tasks

---

## Findings

### Critical (must fix before proceeding)

**C1 — T-73 consumer tests have no home**
`queue/consumer.py` lives in a separate Docker service with no test infrastructure (`queue/` has no `tests/` directory, no `pytest` setup). T-73 currently says "add to `test_queue_stats.py` or a new `test_consumer.py`" — but `test_queue_stats.py` tests the API's queue stats endpoint, not the consumer. And a `test_consumer.py` inside `api/tests/` cannot import from `queue/`.

Two options — pick one before building:
- **Option A**: Create `queue/tests/test_consumer.py` with its own `requirements.txt` addition (`pytest`) and run separately. Clean but adds setup work.
- **Option B**: Drop T-73 entirely and rely on T-77 (manual smoke test) for consumer routing verification. Acceptable given the consumer is already covered by integration behaviour.

Recommend **Option B** — avoids creating a whole new test harness for one feature, and T-77 already covers the routing behaviour end-to-end.

---

### Concerns (should address)

**W1 — `receiver="all"` with zero peers not in T-73 test cases**
The architecture explicitly says this is valid (event stored, consumer logs "no active peers", ACKs). If T-73 stays (Option A), add this case. If T-73 is dropped (Option B), T-77 covers it implicitly.

**W2 — T-74 assumes `GET /connections` is already authenticated in the UI**
The Events page will need to call `GET /connections` to populate the dropdown. This endpoint requires a Bearer JWT. The UI already manages auth for other calls — but the task should explicitly note "use the existing auth mechanism" so the implementer doesn't miss it.

---

### Suggestions (nice to have)

**S1** — T-77 smoke test could be split into two explicit steps: one for `receiver="all"` and one for unicast. Makes it harder to accidentally skip the unicast case.

---

### What's Solid

- Dependency ordering is correct — models before validation before consumer before UI.
- T-71 (fix existing test fixtures) is listed before T-72 (new tests) — correct order.
- The UI handles both the happy path (T-74) and the error path (T-75) — not skipped.
- All 3 user stories are Must priority — appropriate for a breaking-change required field.
- The plan is tight and minimal — no gold-plating.

---

## Verdict

**Status**: Approved with changes
**Blocking issues**: C1 only
**Recommended action**: Resolve C1 (drop T-73 or create queue test harness), then proceed to implementation.
