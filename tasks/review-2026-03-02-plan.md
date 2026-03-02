# Plan Review — V2: User Stories + Todo

**Date**: 2026-03-02
**Reviewing**: `tasks/user-stories.md` + `tasks/todo.md`
**Reviewer**: Claude (Gate 4)

---

## Checklist

### Story Quality
- [x] Every user story traces back to `tasks/architecture.md`
- [x] Every story has ≥2 testable acceptance criteria
- [x] No vague criteria ("works well", "handles edge cases")
- [x] Stories prioritized Must/Should/Could

### Task Quality
- [x] Every to-do references a user story — no orphans
- [ ] Tasks ordered by dependency — **T-15 (install deps) placed after routes that use them**
- [x] Each task is achievable in ≤1 session

### Edge Cases
- [ ] Consumer cross-container import — **T-14 assumes Python import across containers: impossible**
- [ ] Existing tests break on JWT change — **no test-update tasks in plan**
- [ ] `api/services/queue.py` publishes `EventResponse` — **not updated to `EventNotification` in any task**

### Cross-Check
- [x] Architecture and plan consistent
- [ ] Scope matches architecture — two implementation gaps found
- [x] Feasible for one developer

---

## Findings

### Critical (must resolve before implementation)

**C1 — Consumer cannot import `connections_service` across containers**

T-14 states: *"call connections_service.get_active_peers()"*

The consumer runs in the `queue/` container. `connections_service` lives in `api/`. These are
separate Python processes in separate Docker containers on the same network. Python imports do
not cross container boundaries.

Reading `queue/consumer.py`: the consumer already imports `httpx`. The correct approach is:

```python
# queue/consumer.py — getting active peers
peers = httpx.get(
    f"{settings.api_url}/connections",   # NEW config value
    timeout=5
).json()
```

This requires:
1. Add `api_url: str = "http://api:8000"` to `queue/config.py`
2. Add `HILO_API_URL` env var to the consumer service in `docker-compose.yml`
3. Add consumer `depends_on: api: condition: service_healthy` in `docker-compose.yml`
   (consumer already works after queue+graphdb, but now needs api too)
4. Rewrite T-14 to: call `GET {settings.api_url}/connections`, parse response, POST notification

Without this fix, T-14 is not implementable as written.

---

**C2 — `api/services/queue.py` publishes `EventResponse`, not `EventNotification`**

Looking at `api/services/queue.py` line 36-54: `publish_event(event: EventResponse)` serialises
a full `EventResponse` (which includes `triples`) to JSON and publishes it.

After T-05 creates `EventNotification`, someone must change `publish_event` to accept and
publish an `EventNotification` instead. This is the whole point of US-1.

There is no task for this. T-10 says "publish notification to queue" in the route handler,
but `api/services/queue.py` itself is never updated in any task. The route calls
`queue_service.publish_event(stored)` — if the service signature doesn't change, it still
publishes `EventResponse` with triples.

Fix: add a task to update `api/services/queue.py` — rename or add `publish_notification(n: EventNotification)`
and remove or deprecate `publish_event(event: EventResponse)`.

---

**C3 — Existing tests will break on JWT addition — no update tasks**

`api/tests/test_events.py` line 82-88:
```python
def test_get_event_by_id_success():
    event = _make_event("order_created", 1)
    with patch("services.graphdb.get_event_by_id", return_value=event):
        response = client.get("/events/evt-0001")   # no Authorization header
    assert response.status_code == 200              # will be 401 after T-10
```

After T-10 adds JWT auth to `GET /events/{id}`, this test returns `401`. It will fail in CI.
Additionally, `test_get_event_by_id_not_found` also calls the endpoint without auth.

No task in the plan covers updating or adding tests for the JWT behaviour.

Fix: add a task to update `test_events.py` — mock the JWT dependency for existing tests
(pass `HILO_INTERNAL_KEY` or mock `require_jwt` to no-op), and add new tests for the 401/403
cases in US-2's acceptance criteria.

---

### Concerns (should address)

**W1 — `process_event()` in consumer is completely obsolete after the change**

Currently `process_event()` parses `triples` from the message body and calls `_insert_triples()`.
After the two-tier change, the queue carries `EventNotification` (no triples). The entire
`process_event()` function and `_insert_triples()` helper become dead code.

T-14 says "update consumer.py" but doesn't call out that these functions are replaced entirely,
not patched. A developer reading T-14 might try to modify `process_event()` rather than
replacing it. Be explicit: T-14 should state "replace `process_event()` with
`process_notification()` — parse `EventNotification`, forward to peers, no GraphDB writes".

---

**W2 — T-15 (dependencies) is listed after tasks that use those dependencies**

T-15 adds `PyJWT`, `cryptography`, and `httpx` to requirements. These are needed by T-07
(jwt_service.py) and T-14 (consumer HTTP calls). T-15 appears after T-14 in the todo list.

In practice you write the code first and install deps together — but as a checklist it signals
incorrect ordering. Minor, but move T-15 to before T-07.

---

**W3 — No task to update README quickstart curl example**

`README.md` contains:
```bash
curl -X POST http://localhost:8000/events \
  -d '{"source_node": "node-a", "event_type": "shipment_created", "triples": [...]}'
```

After T-05, `source_node` is removed and `subject` is required. The README example will be
wrong and confuse anyone following the quickstart. Add a task to update the README curl example.

---

### Suggestions

**S1 — Consumer `depends_on: api` should be in docker-compose**

If C1 is fixed (consumer calls `GET http://api:8000/connections`), add an explicit
`depends_on: api: condition: service_healthy` in docker-compose. Currently consumer only
depends on `queue` and `graphdb`. This should be a visible dependency, not an implicit one.

**S2 — `HILO_NODE_BASE_URL` warning if left at default**

At startup, if `HILO_NODE_BASE_URL` is `http://localhost:8000` and the Node ID is not `node-a`,
log a warning: "NODE_BASE_URL appears to use default — ensure it is set to the node's public
address for cross-node data_url resolution." Cheap safety net.

---

### What's Solid

**Every story has ≥2 specific, testable acceptance criteria.** US-2 (JWT auth) is especially
well-specified: 401 without header, 401 expired, 401 unknown key, 200 valid, 200 internal key.
These map directly to test cases.

**No orphan tasks.** Every task in todo.md references at least one user story. The linkage
is complete.

**PR sequencing is correct and explicit.** PR 2 branches off PR 1's feature branch; PR 3
waits until both are merged to develop. This is the right order and it's clearly stated.

**US-13 E2E test criteria are specific enough to be a real acceptance test** — not just
"events are exchanged" but exact HTTP calls, expected log lines, and bidirectional verification.

**The token countdown + auto-refresh UX (US-11)** is concisely specified: display countdown,
auto-regenerate at 30s remaining, copy button. Clear enough to implement without ambiguity.

---

## Verdict

**Status**: Approved with changes

**Blocking issues** (fix before implementation):
- C1: Rewrite T-14 — consumer gets peer list via `GET {api_url}/connections`, not Python import.
  Add `api_url` to `queue/config.py`. Add `api` to consumer `depends_on` in docker-compose.
- C2: Add task to update `api/services/queue.py` — `publish_notification(EventNotification)`
  replaces `publish_event(EventResponse)`.
- C3: Add task to update `api/tests/test_events.py` — mock JWT for existing tests; add 401 tests.

**Recommended non-blocking additions**:
- W1: Clarify T-14 explicitly replaces `process_event()` entirely
- W2: Reorder T-15 to before T-07
- W3: Add task to update README curl example

**Recommended action**: Apply C1, C2, C3 fixes to `tasks/todo.md` (not user-stories — stories
are accurate). Then proceed to implementation.
