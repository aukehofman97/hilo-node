from datetime import datetime
from pydantic import BaseModel, Field
import uuid


class EventCreate(BaseModel):
    source_node: str
    event_type: str
    triples: str  # Turtle-formatted RDF string


class EventResponse(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source_node: str
    event_type: str
    triples: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    links: dict = Field(default_factory=dict)
