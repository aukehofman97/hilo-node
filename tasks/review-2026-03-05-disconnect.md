# Review: Connection Disconnect Architecture
**Date**: 2026-03-05
**Artifact**: tasks/architecture-disconnect.md

## Checklist

### Completeness
- [x] Problem statement is clear and specific
- [x] Project context is established
- [x] Every tech choice has a rationale
- [x] Tech choices align with existing stack
- [x] Skill coverage complete — no missing skills
- [x] No open questions unresolved

### Assumptions
- [x] Fire-and-forget failure mode for unreachable peer is documented
- [ ] **CONCERN**: Assumes the JWT is still valid at disconnect time. If the JWT expired and the peer's public key was never stored (e.g. connection never reached `active`), `/disconnected` verification will fail and the peer won't clean up.
- [ ] **CONCERN**: Assumes `peer_node_id` in the URL uniquely identifies one connection per node. If a node somehow has duplicate records for the same peer (edge case from retries), only one gets deleted.

### Over-Engineering
- [x] Two endpoints is the minimum needed for bidirectional sync
- [x] Hard delete is simpler than soft delete — justified for V2
- [x] No new dependencies introduced

## Findings

### Critical (must fix before proceeding)
- None

### Concerns (should address)

1. **JWT verification for pending connections** — The `/disconnected` endpoint verifies the JWT against the stored public key. But for a `pending_outgoing` or `pending_incoming` connection, the public key may not have been stored yet (key exchange happens during acceptance). The architecture doesn't address this. **Proposed fix**: for connections that never reached `active`/`accept_pending`, skip JWT verification on `/disconnected` and instead verify that the `node_id` in the URL matches a known connection — or simply make `/disconnected` unauthenticated (consistent with `/bridge/receive` which is also unauthenticated in V2, with a V3 note).

2. **Race condition on mutual simultaneous disconnect** — If both nodes call disconnect at exactly the same time, each POSTs to the other's `/disconnected`. Both will try to delete a record that may already be gone. The delete should be idempotent (no error if record not found). The architecture doesn't explicitly require this.

### Suggestions (nice to have)
- Show a "Disconnect" option on `pending_outgoing` connections too, to allow cancelling an outgoing request before it's accepted.
- Log the disconnect event in the API for audit purposes.

### What's Solid
- Fire-and-forget on peer failure is the right call — don't block the user on an unreachable peer.
- Reusing existing `sign_token` / JWT infrastructure keeps the implementation minimal.
- Hard delete is the right choice for V2 — no unnecessary complexity.
- Verb-based POST is consistent with the existing endpoint style.

## Verdict

**Status**: Approved with changes
**Blocking issues**: None — but two concerns should be addressed before implementation:
1. Clarify auth strategy for non-active connections on `/disconnected` (recommend: unauthenticated with V3 note, consistent with `/bridge/receive`)
2. Ensure `delete_connection` is idempotent (no error on missing record)

**Recommended action**: Apply changes to architecture doc, then proceed to planning skill.
