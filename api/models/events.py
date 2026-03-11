from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
import uuid


class EventCreate(BaseModel):
    # source_node removed — server stamps from HILO_NODE_ID
    event_type: str
    subject: str  # primary RDF subject URI, e.g. "http://hilo.semantics.io/events/order-001"
    triples: str  # Turtle-formatted RDF string


class EventResponse(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source_node: str          # node that originated the event
    event_type: str
    subject: str
    triples: str              # empty string for peer notifications not yet imported
    created_at: datetime = Field(default_factory=datetime.utcnow)
    links: dict = Field(default_factory=dict)   # always contains "self"; peer notifications also have "data"
    has_local_copy: bool = False  # True once triples are stored locally (always True for local events)
    data_url: Optional[str] = None  # populated on create response so the UI can show the fetch URL


class EventImportRequest(BaseModel):
    triples: str


class EventNotification(BaseModel):
    """Lightweight notification that travels through the queue to peers.
    Contains no RDF triples — peers fetch full data via data_url with a JWT."""
    event_id: str
    event_type: str
    source_node: str
    subject: str
    created_at: datetime
    data_url: str  # "{HILO_NODE_BASE_URL}/events/{event_id}"
