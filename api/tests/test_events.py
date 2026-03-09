"""Tests for event endpoints including JWT auth on POST /events, GET /events, GET /events/{id}."""
from datetime import datetime
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app
from models.events import EventResponse
from services.jwt_service import require_jwt

client = TestClient(app)

# ── Fixtures ──────────────────────────────────────────────────────────────────

def _make_event(event_type: str = "order_created", n: int = 1) -> EventResponse:
    return EventResponse(
        id=f"evt-{n:04d}",
        source_node="node-a",
        event_type=event_type,
        subject=f"http://hilo.semantics.io/events/order-{n:04d}",
        triples="",
        created_at=datetime(2026, 3, 1, 12, 0, 0),
        links={"self": f"/events/evt-{n:04d}"},
    )


MOCK_EVENTS = [
    _make_event("order_created", 1),
    _make_event("shipment_update", 2),
    _make_event("order_created", 3),
]


def _bypass_jwt():
    """Override require_jwt to bypass auth in tests that don't test JWT itself."""
    app.dependency_overrides[require_jwt] = lambda: {"sub": "internal", "iss": "node-a"}
    return app


def _restore_jwt():
    app.dependency_overrides.pop(require_jwt, None)


# ── GET /events (list) — requires internal key ────────────────────────────────

AUTH = {"Authorization": "Bearer dev"}


def test_list_events_no_auth_returns_401():
    """GET /events without Authorization header returns 401."""
    _restore_jwt()
    response = client.get("/events")
    assert response.status_code == 401


def test_list_events_invalid_token_returns_401():
    """GET /events with garbage token returns 401."""
    _restore_jwt()
    response = client.get("/events", headers={"Authorization": "Bearer not-a-real-token"})
    assert response.status_code == 401


def test_list_events_default():
    """Returns all events with default limit when auth is valid."""
    with patch("services.graphdb.get_events", return_value=MOCK_EVENTS):
        response = client.get("/events", headers=AUTH)
    assert response.status_code == 200
    assert len(response.json()) == 3


def test_list_events_limit():
    """Passes limit to service layer."""
    with patch("services.graphdb.get_events", return_value=MOCK_EVENTS[:1]) as mock:
        response = client.get("/events?limit=1", headers=AUTH)
    assert response.status_code == 200
    mock.assert_called_once_with(since=None, event_type=None, limit=1)


def test_list_events_event_type_filter():
    """Passes event_type to service layer."""
    filtered = [e for e in MOCK_EVENTS if e.event_type == "order_created"]
    with patch("services.graphdb.get_events", return_value=filtered) as mock:
        response = client.get("/events?event_type=order_created", headers=AUTH)
    assert response.status_code == 200
    mock.assert_called_once_with(since=None, event_type="order_created", limit=50)
    data = response.json()
    assert all(e["event_type"] == "order_created" for e in data)


def test_list_events_limit_and_type_combined():
    """Both params passed together."""
    with patch("services.graphdb.get_events", return_value=[]) as mock:
        response = client.get("/events?limit=10&event_type=shipment_update", headers=AUTH)
    assert response.status_code == 200
    mock.assert_called_once_with(since=None, event_type="shipment_update", limit=10)


def test_list_events_limit_out_of_range():
    """limit must be between 1 and 500."""
    response = client.get("/events?limit=0", headers=AUTH)
    assert response.status_code == 422

    response = client.get("/events?limit=501", headers=AUTH)
    assert response.status_code == 422


# ── GET /events/{id} — requires JWT ───────────────────────────────────────────

def test_get_event_by_id_no_auth_returns_401():
    """GET /events/{id} without Authorization header returns 401."""
    _restore_jwt()
    response = client.get("/events/evt-0001")
    assert response.status_code == 401


def test_get_event_by_id_invalid_token_returns_401():
    """GET /events/{id} with garbage token returns 401."""
    _restore_jwt()
    response = client.get("/events/evt-0001", headers={"Authorization": "Bearer not-a-real-token"})
    assert response.status_code == 401


def test_get_event_by_id_internal_key_returns_200():
    """GET /events/{id} with HILO_INTERNAL_KEY returns 200."""
    _restore_jwt()
    event = _make_event("order_created", 1)
    with patch("services.graphdb.get_event_by_id", return_value=event):
        # Default internal_key is "dev" (from config default)
        response = client.get("/events/evt-0001", headers={"Authorization": "Bearer dev"})
    assert response.status_code == 200
    assert response.json()["id"] == "evt-0001"


def test_get_event_by_id_not_found_with_auth():
    """Returns 404 for unknown event ID when auth is valid."""
    _bypass_jwt()
    with patch("services.graphdb.get_event_by_id", return_value=None):
        response = client.get("/events/nonexistent-id")
    assert response.status_code == 404
    _restore_jwt()


def test_get_event_by_id_success_with_auth():
    """Returns event when found and auth is valid."""
    _bypass_jwt()
    event = _make_event("order_created", 1)
    with patch("services.graphdb.get_event_by_id", return_value=event):
        response = client.get("/events/evt-0001")
    assert response.status_code == 200
    assert response.json()["id"] == "evt-0001"
    _restore_jwt()


# ── POST /events — requires internal key ──────────────────────────────────────

VALID_PAYLOAD = {
    "event_type": "order_created",
    "subject": "http://hilo.semantics.io/events/order-ORD-001",
    "triples": (
        "@prefix hilo: <http://hilo.semantics.io/ontology/> .\n"
        "@prefix event: <http://hilo.semantics.io/events/> .\n"
        "event:order-ORD-001 a hilo:Order ;\n"
        '    hilo:orderId "ORD-001" .'
    ),
}


def test_create_event_no_auth_returns_401():
    """POST /events without Authorization header returns 401."""
    _restore_jwt()
    response = client.post("/events", json=VALID_PAYLOAD)
    assert response.status_code == 401


def test_create_event_invalid_token_returns_401():
    """POST /events with garbage token returns 401."""
    _restore_jwt()
    response = client.post(
        "/events",
        json=VALID_PAYLOAD,
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert response.status_code == 401


def test_create_event_with_internal_key_returns_201():
    """POST /events with HILO_INTERNAL_KEY returns 201."""
    _restore_jwt()
    event = _make_event("order_created", 1)
    with (
        patch("services.graphdb.store_event", return_value=event),
        patch("services.queue.publish_notification"),
    ):
        response = client.post("/events", json=VALID_PAYLOAD, headers=AUTH)
    assert response.status_code == 201
    assert response.json()["id"] == "evt-0001"


def test_create_event_bypassed_jwt_returns_201():
    """POST /events with bypassed JWT (dependency override) returns 201."""
    _bypass_jwt()
    event = _make_event("order_created", 1)
    with (
        patch("services.graphdb.store_event", return_value=event),
        patch("services.queue.publish_notification"),
    ):
        response = client.post("/events", json=VALID_PAYLOAD)
    assert response.status_code == 201
    _restore_jwt()
