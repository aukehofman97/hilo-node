# Review: Connection Disconnect Plan
**Date**: 2026-03-05
**Artifacts**: tasks/user-stories-disconnect.md, tasks/todo-disconnect.md

## Checklist

### Story Quality
- [x] Every story traces back to architecture-disconnect.md
- [x] Every story has ≥2 testable acceptance criteria
- [x] No vague criteria
- [x] Stories are prioritized (all Must — correct for this scope)

### Task Quality
- [x] Every to-do references a user story — no orphans
- [x] Tasks ordered by dependency (backend → cross-node → frontend)
- [x] Each task is achievable in ≤1 session

### Edge Cases
- [x] Peer unreachable covered (T-4: catch and log, don't block)
- [x] Idempotency covered (T-5)
- [x] User cancellation covered (T-8: confirmation dialog)
- [ ] **CONCERN**: No task covers what happens in the UI when the *peer* disconnects you. Your connection list auto-refreshes — so the record will disappear on next poll. But there's no user-facing indication of *why* it disappeared. Minor, but worth noting.
- [ ] **CONCERN**: T-2 says "requires internal key" but the existing `disconnect` endpoint is called from the browser via the UI. The UI already uses `VITE_API_URL` and the API has `HILO_INTERNAL_KEY=dev` bypass. This is consistent — just worth confirming the internal key header is sent in T-6.

### Cross-Check
- [x] Architecture and plan are consistent — no contradictions
- [x] Scope matches architecture — nothing added, nothing missed
- [x] 9 tasks, all implementable in one session

## Findings

### Critical
- None

### Concerns
1. **T-6 missing auth header** — `disconnectFromPeer` in `connections.ts` needs to send `Authorization: Bearer dev` (the internal key) so the API accepts the call. The architecture specifies internal key auth for the local `/disconnect` endpoint but T-6 doesn't mention it explicitly.

2. **Silent disappearance when peer disconnects you** — If Node B disconnects from Node A, Node A's connection disappears on the next UI poll with no explanation. Acceptable for V2 but worth a note.

### Suggestions
- T-9 could also refresh the full connections list after disconnect rather than just removing from local state — avoids stale UI if the API returns a different state than expected.

### What's Solid
- Backend-first task ordering is correct — frontend tasks depend on the endpoints existing.
- Idempotency is explicitly called out as its own task (T-5) — good discipline.
- US-3 correctly identifies that consumer forwarding is handled implicitly by the hard delete, with no extra task needed. Clean.
- Confirmation dialog copy is specific: "Remove connection with {peer_name}? This cannot be undone." — testable, not vague.

## Verdict

**Status**: Approved with changes
**Blocking issues**: None — one small fix before implementation:
- T-6: explicitly note that `disconnectFromPeer` must include `Authorization: Bearer {internalKey}` header (same pattern as other internal API calls in `connections.ts`)

**Recommended action**: Apply fix to T-6, then proceed to implementation.
