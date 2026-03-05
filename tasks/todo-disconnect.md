# To-Do: Connection Disconnect

**Feature**: Connection Disconnect
**Architecture ref**: tasks/architecture-disconnect.md
**Date**: 2026-03-05

## Status legend
- [ ] Pending
- [x] Done

---

## Backend

- [ ] T-1 Add `delete_connection(peer_node_id)` to `api/services/connections.py` — idempotent, no error if record not found (US-1, US-2)
- [ ] T-2 Add `POST /connections/{peer_node_id}/disconnect` to `api/routes/connections.py` — requires internal key, calls peer `/disconnected`, then deletes locally (US-1)
- [ ] T-3 Add `POST /connections/{node_id}/disconnected` to `api/routes/connections.py` — unauthenticated, idempotent delete (US-2)

## Cross-node notification

- [ ] T-4 In the `disconnect` handler: fetch `peer_base_url` from the connection record, POST to `{peer_base_url}/connections/{this_node_id}/disconnected`, catch and log on failure without blocking (US-2)
- [ ] T-5 Verify idempotency: calling `/disconnected` for a non-existent peer returns 200, not 404 (US-2)

## Frontend

- [ ] T-6 Add `disconnectFromPeer(peerNodeId)` to `ui/src/api/connections.ts` — POSTs to `/connections/{peer_node_id}/disconnect` (US-1)
- [ ] T-7 Add Disconnect button to connection card in `ui/src/pages/Connections.tsx` — visible for all statuses except `rejected` (US-1)
- [ ] T-8 Add confirmation dialog before disconnect — "Remove connection with {peer_name}? This cannot be undone." (US-1)
- [ ] T-9 On success: remove connection from local list state. On error: show inline error message (US-1)
