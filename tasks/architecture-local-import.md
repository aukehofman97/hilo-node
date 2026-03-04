# Architecture: Local Import of Remote Event Triples

**Project**: HILO Node
**Date**: 2026-03-04
**Status**: Approved (2026-03-04)

---

## Problem Statement

When Node B receives a peer notification it stores only metadata (no triples). A user can fetch the full Turtle payload from the source node on-demand via the Events Monitor, but the triples are shown in the UI only — they are never persisted to Node B's own triple store. The user wants to be able to import those fetched triples into the local triple store so they can be queried via SPARQL, explored in the Data Explorer, and accessed without the source node being available.

---

## Project Context

- **Backend**: FastAPI + Pydantic v2, `graphdb.py` service layer for all SPARQL/Fuseki operations
- **Triple store**: Apache Jena Fuseki; events stored as Turtle via `POST /dataset/data`
- **Two-tier event model**: originating node stores full triples; peers store `EventNotification` (metadata + `hilo:dataUrl`, no triples)
- **Frontend**: React + TypeScript; `Events.tsx` handles fetch flow; `ui/src/api/events.ts` is the API client

### Current notification record in Fuseki (Node B, before import)

```turtle
<http://hilo.semantics.io/events/meta/{id}> a hilo:Event ;
    hilo:eventId "{id}" ;
    hilo:sourceNode "node-a" ;
    hilo:eventType "..." ;
    hilo:subject "..." ;
    hilo:createdAt "..."^^xsd:dateTime ;
    hilo:dataUrl "http://localhost:8000/events/{id}" .
    # ← no hilo:triplesPayload
```

---

## Proposed Solution

After the user fetches the full event from the source node (existing flow), a **"Store locally" button** appears in the detail panel. On click, the frontend calls a new `POST /events/{id}/import` endpoint with the fetched Turtle payload. The backend upgrades the existing notification in Fuseki by adding `hilo:triplesPayload` to the existing event subject and inserting the actual triples into the dataset. On success, the event is re-fetched from the local API and the status badge changes from `received` → `imported`.

---

## Tech Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Store trigger | Separate "Store locally" button (user choice) | User controls what enters their triple store; fetch and import are distinct actions |
| Storage semantics | Upgrade in place (user choice) | The event is the same logical entity — add `hilo:triplesPayload` to the existing subject. `hilo:dataUrl` stays so origin remains traceable. No duplicate records. |
| Status after import | New `imported` badge (green) (user choice) | Distinguishable from `received` (triples absent) and `published` (originated here). Derivable from `has_local_copy` field. |
| Import request body | `{ triples: string }` | Passes the Turtle string the UI just fetched from the source. API escapes and stores it. |
| Status detection in list | Add `has_local_copy: bool` to `EventResponse` | Enables correct badge on every list row without returning full Turtle payloads in the list query. Set via `OPTIONAL { ?event hilo:triplesPayload ?tp }` in SPARQL. |
| Idempotency | Import endpoint returns 409 if already imported | Second import attempt is clearly rejected; user gets feedback rather than a silent duplicate write. |
| Write order in import | Insert triples first, then update metadata | If metadata UPDATE succeeds but `insert_turtle` fails, `has_local_copy` would be True while triples are missing — a silent lie. Reversed order: orphaned triples are safe; metadata only written after triples confirmed. Fuseki re-insertion is idempotent so retries are clean. |
| `has_local_copy` SPARQL | `BIND(BOUND(?tp) AS ?hasLocalCopy)` | Avoids returning the full Turtle payload string for every row in the `get_events` list query. Boolean binding only. |
| Bad request on local events | `POST /events/{id}/import` returns 400 for locally-originated events | Check sequence: 404 (not found) → 400 (no `hilo:dataUrl` — not a peer notification) → 409 (already imported) → 200 (proceed). Clear errors at each step. |
| Re-fetch after import | `fetchEvent(selectedId)` on success | Confirms storage worked; updates `detail` state with `has_local_copy: true` so badge reflects new status immediately. |

---

## Components Affected

| Component | Change |
|---|---|
| `api/models/events.py` | Add `EventImportRequest` model; add `has_local_copy: bool` (default `False`) to `EventResponse` |
| `api/services/graphdb.py` | New `import_event_triples(event_id, triples)`; add `OPTIONAL { ?event hilo:triplesPayload ?tp }` to `get_events()` + `get_event_by_id()` SPARQL; set `has_local_copy` in both |
| `api/routes/events.py` | New `POST /events/{event_id}/import` endpoint (requires internal key auth) |
| `ui/src/api/events.ts` | New `importEvent(id, triples)` function; update `Event` interface: add `has_local_copy?: boolean` |
| `ui/src/pages/Events.tsx` | New `storing` / `stored` state; `handleStoreLocally()` handler; "Store locally" button in `DetailPanel`; updated status badge derivation to include `imported`; new `imported` badge style |

---

## Endpoint Design

### `POST /events/{event_id}/import`

**Auth**: Requires `Bearer {internal_key}` (same as `GET /events/{id}` — local UI only, uses `Depends(require_jwt)`)

**Request body**:
```json
{ "triples": "<turtle string fetched from source node>" }
```

**Response (200)**:
```json
{ "status": "imported", "id": "..." }
```

**Behavior** (check sequence is strict):
1. Look up existing event by `event_id` — **404** if not found
2. Verify event has `hilo:dataUrl` (is a peer notification) — **400** if not (locally-originated event, import makes no sense)
3. Verify event has no `hilo:triplesPayload` — **409** if already imported
4. `insert_turtle(triples)` — inserts the actual RDF triples into the dataset (**first**)
5. SPARQL INSERT: add `hilo:triplesPayload "{escaped}"` to the existing event subject (**second**, only after triples are confirmed stored)
6. Return `{ "status": "imported", "id": event_id }`

**Note on write order**: triples are inserted before metadata is updated. If step 4 fails, the user retries cleanly (no metadata written). If step 5 fails, orphaned triples exist but the event still shows as `received` — the user can retry and step 4 re-inserts idempotently.

**"Store locally" button visibility rule** (frontend): button appears only when `detail.triples` is non-empty AND `detail.has_local_copy === false`. When `selectedId` changes, both `detail` and `stored` state are reset, so the button correctly disappears/reappears based on fresh data.

---

## Status Badge Derivation (updated rule)

| Condition | Status |
|---|---|
| `source_node === localNodeId` | `published` |
| `source_node !== localNodeId && !has_local_copy` | `received` |
| `source_node !== localNodeId && has_local_copy` | `imported` |

---

## Skill Coverage

| Technology | Skill | Status |
|---|---|---|
| FastAPI route + Pydantic model | `api-development` | ✅ exists |
| SPARQL UPDATE + Fuseki INSERT | `rdf-transformation` + `api-development` | ✅ exists |
| React state + UI component | `frontend` | ✅ exists |
| Git workflow | `git-workflow` | ✅ exists |

---

## Open Questions

None — all design decisions made with user during requirements gathering and review (2026-03-04).

---

## Feature Branch

`feature/local-event-import` off `main`.

---

## Next Step

→ Run **planning** skill (Gate 3).
