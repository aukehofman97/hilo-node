import logging
from datetime import datetime, timezone
from typing import Optional

import sentry_sdk
from fastapi import APIRouter, Depends, HTTPException, Query

from config import settings
from models.events import EventCreate, EventImportRequest, EventNotification, EventResponse
from services import graphdb, queue as queue_service
from services.jwt_service import require_jwt

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/events", tags=["events"])


@router.post("", status_code=201, response_model=EventResponse)
def create_event(event: EventCreate, _token: dict = Depends(require_jwt)):
    # Server stamps source_node — callers do not assert their own identity
    stored = graphdb.store_event(event)
    logger.info("Event created: %s type=%s", stored.id, stored.event_type)

    # Build lightweight notification (no triples) for the queue
    notification = EventNotification(
        event_id=stored.id,
        event_type=stored.event_type,
        source_node=stored.source_node,
        subject=stored.subject,
        created_at=stored.created_at,
        data_url=f"{settings.node_base_url}/events/{stored.id}",
    )

    stored.data_url = notification.data_url

    try:
        queue_service.publish_notification(notification)
    except Exception as exc:
        logger.error("Queue publish failed: %s", exc)
        sentry_sdk.capture_exception(exc)

    return stored


@router.get("", response_model=list[EventResponse])
def list_events(
    since: Optional[str] = Query(default=None),
    event_type: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    _token: dict = Depends(require_jwt),
):
    return graphdb.get_events(since=since, event_type=event_type, limit=limit)


@router.get("/{event_id}", response_model=EventResponse)
def get_event(event_id: str, _token: dict = Depends(require_jwt)):
    """Retrieve full event with triples. Requires a valid Bearer JWT or internal key."""
    event = graphdb.get_event_by_id(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@router.post("/{event_id}/import", status_code=200)
def import_event(event_id: str, body: EventImportRequest, token_payload: dict = Depends(require_jwt)):
    """Import fetched RDF triples from a peer event into the local triple store.

    Local UI only — peer JWTs are rejected (C2).
    Check sequence: 404 → 400 → 409 → 200.
    """
    # C2: import is local-UI only — reject peer JWTs
    if token_payload.get("sub") != "internal":
        raise HTTPException(status_code=403, detail="Import endpoint is local-UI only")

    # 404 — event not found
    event = graphdb.get_event_by_id(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")

    # 400 — not a peer notification (locally-originated events have no hilo:dataUrl)
    if "data" not in event.links:
        raise HTTPException(
            status_code=400,
            detail="This event was originated locally — import is only valid for peer notifications",
        )

    # 409 — already imported
    if event.has_local_copy:
        raise HTTPException(status_code=409, detail="Event already imported")

    graphdb.import_event_triples(event_id, body.triples)
    return {"status": "imported", "id": event_id}
