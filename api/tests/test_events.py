"""Tests for GET /events with limit and event_type params."""
from datetime import datetime
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app
from models.events import EventResponse

client = TestClient(app)


def _make_event(event_type: str = "order_created", n: int = 1) -> EventResponse:
    return EventResponse(
        id=f"evt-{n:04d}",
        source_node="node-a",
        event_type=event_type,
        triples="",
        created_at=datetime(2026, 3, 1, 12, 0, 0),
        links={"self": f"/events/evt-{n:04d}"},
    )


MOCK_EVENTS = [
    _make_event("order_created", 1),
    _make_event("shipment_update", 2),
    _make_event("order_created", 3),
]


def test_list_events_default():
    """Returns all events with default limit."""
    with patch("services.graphdb.get_events", return_value=MOCK_EVENTS):
        response = client.get("/events")
    assert response.status_code == 200
    assert len(response.json()) == 3


def test_list_events_limit():
    """Passes limit to service layer."""
    with patch("services.graphdb.get_events", return_value=MOCK_EVENTS[:1]) as mock:
        response = client.get("/events?limit=1")
    assert response.status_code == 200
    mock.assert_called_once_with(since=None, event_type=None, limit=1)


def test_list_events_event_type_filter():
    """Passes event_type to service layer."""
    filtered = [e for e in MOCK_EVENTS if e.event_type == "order_created"]
    with patch("services.graphdb.get_events", return_value=filtered) as mock:
        response = client.get("/events?event_type=order_created")
    assert response.status_code == 200
    mock.assert_called_once_with(since=None, event_type="order_created", limit=50)
    data = response.json()
    assert all(e["event_type"] == "order_created" for e in data)


def test_list_events_limit_and_type_combined():
    """Both params passed together."""
    with patch("services.graphdb.get_events", return_value=[]) as mock:
        response = client.get("/events?limit=10&event_type=shipment_update")
    assert response.status_code == 200
    mock.assert_called_once_with(since=None, event_type="shipment_update", limit=10)


def test_list_events_limit_out_of_range():
    """limit must be between 1 and 500."""
    response = client.get("/events?limit=0")
    assert response.status_code == 422

    response = client.get("/events?limit=501")
    assert response.status_code == 422


def test_get_event_by_id_not_found():
    """Returns 404 for unknown event ID."""
    with patch("services.graphdb.get_event_by_id", return_value=None):
        response = client.get("/events/nonexistent-id")
    assert response.status_code == 404


def test_get_event_by_id_success():
    """Returns event when found."""
    event = _make_event("order_created", 1)
    with patch("services.graphdb.get_event_by_id", return_value=event):
        response = client.get("/events/evt-0001")
    assert response.status_code == 200
    assert response.json()["id"] == "evt-0001"
