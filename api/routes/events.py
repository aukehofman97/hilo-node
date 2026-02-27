import logging

from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from models.events import EventCreate, EventResponse
from services import graphdb, queue as queue_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/events", tags=["events"])


@router.post("", status_code=201, response_model=EventResponse)
def create_event(event: EventCreate):
    stored = graphdb.store_event(event)
    try:
        queue_service.publish_event(stored)
    except Exception as exc:
        logger.error("Queue publish failed: %s", exc)
    return stored


@router.get("", response_model=list[EventResponse])
def list_events(since: Optional[str] = Query(default=None)):
    return graphdb.get_events(since=since)


@router.get("/{event_id}", response_model=EventResponse)
def get_event(event_id: str):
    event = graphdb.get_event_by_id(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return event
