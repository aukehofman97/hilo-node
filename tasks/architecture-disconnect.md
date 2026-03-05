# Architecture: Connection Disconnect

**Project**: HILO Node
**Date**: 2026-03-05
**Status**: Approved (2026-03-05)

## Problem Statement

Once two nodes are connected there is no way to remove the connection. Either node should be able to disconnect, and when it does the peer's connection record must also be removed — so both nodes stay in sync and the consumer stops forwarding events to a disconnected peer.

## Project Context

- **Stack**: FastAPI + SQLite (connection state) + React/Vite UI + RS256 JWT auth
- **Existing pattern**: Connections follow a state machine (pending → accepted → active). Mutations use verb-based POST endpoints (`/accept`, `/reject`, `/resend`). JWT auth is already in place for cross-node calls.
- **Consumer**: Reads active connections from the API at `GET /connections` before forwarding. Removing a connection immediately stops forwarding.

## Proposed Solution

Add a `POST /connections/{peer_node_id}/disconnect` endpoint. When called, the node notifies its peer via a new `POST /connections/{node_id}/disconnected` endpoint (JWT-authenticated), then hard-deletes the connection locally. The peer verifies the JWT, deletes its matching record, and responds. If the peer is unreachable, the local delete still proceeds (fire-and-forget on failure).

## Tech Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Endpoint style | `POST /disconnect` verb (not DELETE) | Consistent with existing `/accept`, `/reject`, `/resend` pattern |
| Peer notification auth | RS256 JWT (existing `sign_token`) | Already have the infrastructure; peer can verify against stored public key before deleting |
| If peer unreachable | Delete locally anyway, log warning | Connection is broken either way; don't block the user |
| Storage | Hard delete from SQLite | No value in keeping disconnected records in V2; clean slate |
| UI confirmation | Confirmation dialog before disconnect | Destructive action — prevent accidental clicks |
| Which connections can be disconnected | All statuses except `rejected` | Pending connections should also be cancellable |

## API Surface Changes

### New endpoints

**`POST /connections/{peer_node_id}/disconnect`** (local — authenticated with internal key for UI)
- Generates JWT signed by this node
- POSTs notification to peer's `/connections/{this_node_id}/disconnected`
- Hard-deletes connection from local SQLite regardless of peer response
- Returns `{"status": "disconnected", "peer": peer_node_id}`

**`POST /connections/{node_id}/disconnected`** (cross-node — intentionally unauthenticated in V2)
- No sensitive data involved — consistent with `/bridge/receive` decision
- Hard-deletes the matching connection from local SQLite (idempotent — no error if record not found)
- Returns `{"status": "ok"}`
- V3: add sender JWT verification once key storage is guaranteed for all connection states

### No changes to existing endpoints

## Components Affected

| Component | Change |
|---|---|
| `api/routes/connections.py` | Add two new endpoints |
| `api/services/connections.py` | Add `delete_connection(peer_node_id)` |
| `ui/src/api/connections.ts` | Add `disconnectFromPeer(peerNodeId)` |
| `ui/src/pages/Connections.tsx` | Add Disconnect button + confirmation dialog to connection card |

## Skill Coverage

| Technology | Skill exists? |
|---|---|
| FastAPI routes | ✅ api-development |
| JWT auth (existing) | ✅ api-development |
| SQLite / connections service | ✅ api-development |
| React UI | ✅ frontend-design |

## Open Questions

None — decisions resolved above.

## Next Step

→ Review skill, then planning skill.
