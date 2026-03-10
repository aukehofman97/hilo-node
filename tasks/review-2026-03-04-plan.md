# Review: Plan — Local Import of Remote Event Triples

**Date**: 2026-03-04
**Artifacts reviewed**: `tasks/user-stories.md` (US-14–16), `tasks/todo.md` (T-40–47)
**Architecture ref**: `tasks/architecture-local-import.md`

---

## Checklist

### Story Quality
- [x] Every user story traces back to architecture doc
- [x] US-14: 4 acceptance criteria, all testable
- [x] US-15: 7 acceptance criteria including all 3 error codes + write-order failure mode
- [x] US-16: 5 acceptance criteria including the "no hardcoded node names" rule
- [x] All three stories have Priority: Must
- [x] No vague criteria ("works well" / "handles edge cases")

### Task Quality
- [x] Every task references its parent user story (no orphans)
- [x] Tasks ordered by dependency: branch → models → service → route → frontend API → frontend UI → verify → commit
- [x] Each task is achievable in a single session
- [x] All 5 architecture components (models, service, route, API client, UI) have exactly one covering task

### Edge Cases
- [x] US-15 covers 404, 400 (wrong event type), 409 (already imported)
- [x] US-15 covers write-order partial failure (step 4 succeeds, step 5 fails)
- [x] US-14 covers button reset on `selectedId` change
- [x] US-14 covers "already imported" suppression (button does not reappear)

### Cross-Check
- [x] Architecture and plan are consistent — no contradictions
- [x] `BIND(BOUND(?tp) AS ?hasLocalCopy)` pattern is in T-42 (matches C2 fix from architecture review)
- [x] Write order (triples first, metadata second) is in T-42 (matches C1 fix from architecture review)
- [x] 404/400/409 check sequence is in T-43 (matches C3 fix from architecture review)
- [x] Button visibility rule (`detail.triples non-empty AND !has_local_copy`) is in T-45
- [x] Re-fetch after import (`fetchEvent(selectedId)`) is in T-45

---

## Findings

### Critical

None.

---

### Concerns

**C1 — `remoteError` state reused for two distinct operations**

`handleStoreLocally` is described in T-45 as setting `remoteError` on failure — the same state used by `handleFetchFromSource`. These are sequential operations, so they can't both fail simultaneously, but:
- A failed store would overwrite any prior fetch error in state
- A developer debugging later won't know from the state variable which operation failed
- If the UX ever evolves to show persistent error context, this becomes a bug

**Proposed fix during implementation**: rename `remoteError` → `fetchError`, add a separate `storeError: string | null` state. Each handler clears only its own error on retry. No architecture change needed — this is an implementation detail in T-45.

**C2 — `require_jwt` accepts peer JWTs on `POST /events/{id}/import`**

`require_jwt` (as currently implemented) accepts both the internal key AND valid peer RS256 JWTs. The import endpoint is semantically local-UI-only — a connected peer calling `POST /events/{id}/import` on another node would be importing triples into that node's store, which is nonsensical. In V2 there is no attacker model that makes this dangerous (peer would need a valid JWT and the event ID), but the API surface is misleading.

**Proposed fix during implementation**: In the import route, after `require_jwt` passes, check `token_payload["sub"] == "internal"` and return `403 Forbidden` if not. Alternatively, create a `require_internal_key` dependency that only accepts the internal key. The simpler check is preferred.

---

### Suggestions

**S1 — T-46 verification step 5: add the specific SPARQL query**

Step 5 says "SPARQL query on Fuseki `hilo-b` dataset confirms the RDF triples are present" but doesn't give the query. During verification this ambiguity wastes time. Suggest appending:
```sparql
SELECT * WHERE { ?s ?p ?o } LIMIT 20
# or more specific: SELECT * WHERE { <http://hilo.semantics.io/events/meta/{id}> ?p ?o }
```

---

## What's Solid

- **Complete coverage**: every architecture component (5 files) maps to exactly one task
- **Write order correctly captured in T-42**: "insert_turtle first, then SPARQL INSERT" — matches the review fix
- **SPARQL BIND pattern in T-42**: `BIND(BOUND(?tp) AS ?hasLocalCopy)` is explicit — no risk of full payload leak
- **T-46 step 3 tests persistence**: "close panel and reopen → badge still shows `imported`" verifies the backend SPARQL update works, not just the in-memory state
- **T-43 check sequence is strict**: 404 → 400 → 409 → 200 — all error cases resolved before proceeding
- **Dependencies respected**: frontend tasks (T-44, T-45) are ordered after backend tasks (T-41–43)

---

## Verdict

**Status**: Approved
**Blocking issues**: None
**Recommended action**: Proceed to implementation on `feature/local-event-import`. Address C1 (separate error states) and C2 (local-only auth check) during T-45 and T-43 respectively — they are implementation details, not planning gaps.
