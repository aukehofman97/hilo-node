# User Stories — Event Receiver Targeting

**Architecture ref**: `tasks/architecture-receiver-targeting.md`
**Date**: 2026-03-11

---

### US-17: Required receiver field on event creation

**As a** node operator
**I want** to specify a `receiver` when posting an event
**So that** routing is explicit and only the intended peer (or all active peers) receives the notification

**Acceptance criteria:**
- [ ] `POST /events` without `receiver` returns 422
- [ ] `POST /events` with `receiver = "all"` succeeds
- [ ] `POST /events` with `receiver = <active peer_node_id>` succeeds
- [ ] `POST /events` with `receiver = <peer_name or unknown string>` returns 422
- [ ] `POST /events` with `receiver = <inactive/pending peer_node_id>` returns 422
- [ ] `receiver` is passed through to `EventNotification` (visible in queue message body)

**Linked tasks:** T-67, T-68, T-69, T-71, T-72
**Architecture ref:** Components Affected — models/events.py, routes/events.py
**Priority:** Must

---

### US-18: Consumer routes notifications based on receiver

**As a** queue consumer
**I want** to read `receiver` from the notification and filter peer forwarding accordingly
**So that** unicast events reach only the intended peer and broadcast events reach all active peers

**Acceptance criteria:**
- [ ] `receiver = "all"` → notification forwarded to all active peers (existing behavior preserved)
- [ ] `receiver = <peer_node_id>` → notification forwarded only to that peer; other active peers do not receive it
- [ ] If the targeted peer is not found in active peers at consume time → warning logged, message still ACK'd (no dead-letter)
- [ ] `receiver` missing from notification body → consumer raises a deserialization error (no silent default)

**Linked tasks:** T-70, T-73
**Architecture ref:** Components Affected — queue/consumer.py
**Priority:** Must

---

### US-19: Receiver dropdown in the Post Event UI form

**As a** node operator using the UI
**I want** a receiver dropdown in the Post Event form showing my active connections by name
**So that** I can target a specific peer without manually typing a node ID

**Acceptance criteria:**
- [ ] Dropdown is present in the Post Event form with at least one option: "all (broadcast)"
- [ ] Each active connection appears as an option with `peer_name` as the label and `peer_node_id` as the submitted value
- [ ] Submitting the form sends the `peer_node_id` (not `peer_name`) in the request body
- [ ] If the API returns 422 (e.g. peer went inactive between render and submit), a clear inline error is shown — not a raw error dump

**Linked tasks:** T-74, T-75
**Architecture ref:** Components Affected — ui/src/pages/Events.tsx
**Priority:** Must
