import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from config import settings
from models.events import EventCreate, EventNotification, EventResponse
from services import graphdb, queue as queue_service
from services.jwt_service import require_jwt

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/events", tags=["events"])


@router.post("", status_code=201, response_model=EventResponse)
def create_event(event: EventCreate):
    # Server stamps source_node — callers do not assert their own identity
    stored = graphdb.store_event(event)

    # Build lightweight notification (no triples) for the queue
    notification = EventNotification(
        event_id=stored.id,
        event_type=stored.event_type,
        source_node=stored.source_node,
        subject=stored.subject,
        created_at=stored.created_at,
        data_url=f"{settings.node_base_url}/events/{stored.id}",
    )

    try:
        queue_service.publish_notification(notification)
    except Exception as exc:
        logger.error("Queue publish failed: %s", exc)

    return stored


@router.get("", response_model=list[EventResponse])
def list_events(
    since: Optional[str] = Query(default=None),
    event_type: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
):
    return graphdb.get_events(since=since, event_type=event_type, limit=limit)


@router.get("/{event_id}", response_model=EventResponse)
def get_event(event_id: str, _token: dict = Depends(require_jwt)):
    """Retrieve full event with triples. Requires a valid Bearer JWT or internal key."""
    event = graphdb.get_event_by_id(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return event
