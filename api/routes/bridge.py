"""
POST /bridge/receive — accept forwarded event notifications from peer nodes.

Intentionally unauthenticated: notifications carry no sensitive data (no triples).
A forged notification results in a 404 or 401 when the peer tries to fetch data.
V3/V4: add sender JWT verification for stricter sender validation.
"""
import logging

from fastapi import APIRouter

from models.events import EventNotification
from services import graphdb

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bridge", tags=["bridge"])


@router.post("/receive", status_code=200)
def receive_notification(notification: EventNotification) -> dict:
    """Store incoming event notification from a peer node.

    Does NOT re-forward — avoids propagation loops.
    Full event data is fetched lazily on demand via notification.data_url.
    """
    graphdb.store_notification(notification)
    logger.info(
        "Bridge: received notification for event %s from %s",
        notification.event_id,
        notification.source_node,
    )
    return {"status": "received", "event_id": notification.event_id}
