# User Stories: Connection Disconnect

**Feature**: Connection Disconnect
**Architecture ref**: tasks/architecture-disconnect.md
**Date**: 2026-03-05

---

### US-1: Disconnect from a peer (local)

**As a** node operator
**I want** to remove an active or pending connection from my node
**So that** my node stops sharing events with that peer and the connection is cleaned up

**Acceptance criteria:**
- [ ] A Disconnect button is visible on every connection card (all statuses except `rejected`)
- [ ] Clicking Disconnect shows a confirmation dialog before proceeding
- [ ] Confirming calls `POST /connections/{peer_node_id}/disconnect` on the local API
- [ ] The connection disappears from the Connections list after success
- [ ] If the API call fails, an error message is shown and the connection remains

**Linked tasks:** T-1, T-2, T-3
**Architecture ref:** API Surface Changes — `POST /connections/{peer_node_id}/disconnect`
**Priority:** Must

---

### US-2: Peer is notified on disconnect

**As a** peer node
**I want** to be notified when the other node disconnects
**So that** my connection record is also removed and I don't keep forwarding events to a gone peer

**Acceptance criteria:**
- [ ] When Node A disconnects, it POSTs to Node B's `POST /connections/{node_a_id}/disconnected`
- [ ] Node B's connection record is deleted upon receiving the notification
- [ ] If Node B is unreachable, Node A still deletes its own record and logs a warning
- [ ] The `/disconnected` endpoint is idempotent — no error if the connection record doesn't exist

**Linked tasks:** T-4, T-5
**Architecture ref:** API Surface Changes — `POST /connections/{node_id}/disconnected`
**Priority:** Must

---

### US-3: Consumer stops forwarding after disconnect

**As a** node operator
**I want** event forwarding to stop immediately after disconnecting
**So that** no events are sent to a peer I've disconnected from

**Acceptance criteria:**
- [ ] After disconnect, `GET /connections` no longer returns the removed peer as active
- [ ] The consumer's next forwarding cycle finds no active connection to the disconnected peer

**Linked tasks:** T-2 (covered by hard delete — no extra work needed)
**Architecture ref:** Proposed Solution
**Priority:** Must
