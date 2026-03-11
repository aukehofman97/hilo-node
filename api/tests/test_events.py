"""Tests for event endpoints including JWT auth on POST /events, GET /events, GET /events/{id}."""
from datetime import datetime
from unittest.mock import patch, MagicMock

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
    "receiver": "all",
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


def test_create_event_logs_info_on_success():
    """Successful event creation emits logger.info with event_id and event_type."""
    event = _make_event("order_created", 1)
    with (
        patch("services.graphdb.store_event", return_value=event),
        patch("services.queue.publish_notification"),
        patch("routes.events.logger") as mock_logger,
    ):
        response = client.post("/events", json=VALID_PAYLOAD, headers=AUTH)
    assert response.status_code == 201
    mock_logger.info.assert_called_once_with(
        "Event created: %s type=%s", "evt-0001", "order_created"
    )


def test_create_event_queue_failure_still_returns_201():
    """Queue publish failure does not prevent a 201 response — event is still stored."""
    event = _make_event("order_created", 1)
    with (
        patch("services.graphdb.store_event", return_value=event),
        patch("services.queue.publish_notification", side_effect=Exception("RabbitMQ down")),
    ):
        response = client.post("/events", json=VALID_PAYLOAD, headers=AUTH)
    assert response.status_code == 201


def test_create_event_queue_failure_logs_error():
    """Queue publish failure calls logger.error."""
    event = _make_event("order_created", 1)
    with (
        patch("services.graphdb.store_event", return_value=event),
        patch("services.queue.publish_notification", side_effect=Exception("RabbitMQ down")),
        patch("routes.events.logger") as mock_logger,
    ):
        client.post("/events", json=VALID_PAYLOAD, headers=AUTH)
    mock_logger.error.assert_called_once()
    assert "Queue publish failed" in mock_logger.error.call_args[0][0]


# ── POST /events/{id}/import ──────────────────────────────────────────────────

VALID_IMPORT_PAYLOAD = {
    "triples": "@prefix ex: <http://example.org/> .\nex:thing a ex:Thing .",
}


def _make_peer_event(has_local_copy: bool = False) -> EventResponse:
    """Peer notification event — has a data URL in links."""
    return EventResponse(
        id="evt-0001",
        source_node="node-b",
        event_type="order_created",
        subject="http://hilo.semantics.io/events/order-0001",
        triples="",
        created_at=datetime(2026, 3, 1, 12, 0, 0),
        links={"self": "/events/evt-0001", "data": "http://node-b:8000/events/evt-0001"},
        has_local_copy=has_local_copy,
    )


def _make_local_event() -> EventResponse:
    """Locally-originated event — no data URL in links."""
    return EventResponse(
        id="evt-0001",
        source_node="node-a",
        event_type="order_created",
        subject="http://hilo.semantics.io/events/order-0001",
        triples="@prefix ex: <http://example.org/> .\nex:thing a ex:Thing .",
        created_at=datetime(2026, 3, 1, 12, 0, 0),
        links={"self": "/events/evt-0001"},
        has_local_copy=True,
    )


def test_import_event_success():
    """POST /events/{id}/import with internal JWT returns 200."""
    _bypass_jwt()
    with (
        patch("services.graphdb.get_event_by_id", return_value=_make_peer_event()),
        patch("services.graphdb.import_event_triples"),
    ):
        response = client.post("/events/evt-0001/import", json=VALID_IMPORT_PAYLOAD)
    assert response.status_code == 200
    assert response.json() == {"status": "imported", "id": "evt-0001"}
    _restore_jwt()


def test_import_event_rejects_peer_jwt_returns_403():
    """POST /events/{id}/import with non-internal sub returns 403."""
    app.dependency_overrides[require_jwt] = lambda: {"sub": "node-b", "iss": "node-b"}
    with patch("services.graphdb.get_event_by_id", return_value=_make_peer_event()):
        response = client.post("/events/evt-0001/import", json=VALID_IMPORT_PAYLOAD)
    assert response.status_code == 403
    _restore_jwt()


def test_import_event_not_found_returns_404():
    """POST /events/{id}/import returns 404 when event does not exist."""
    _bypass_jwt()
    with patch("services.graphdb.get_event_by_id", return_value=None):
        response = client.post("/events/nonexistent/import", json=VALID_IMPORT_PAYLOAD)
    assert response.status_code == 404
    _restore_jwt()


def test_import_event_local_event_returns_400():
    """POST /events/{id}/import returns 400 for locally-originated events."""
    _bypass_jwt()
    with patch("services.graphdb.get_event_by_id", return_value=_make_local_event()):
        response = client.post("/events/evt-0001/import", json=VALID_IMPORT_PAYLOAD)
    assert response.status_code == 400
    _restore_jwt()


def test_import_event_already_imported_returns_409():
    """POST /events/{id}/import returns 409 when triples already imported."""
    _bypass_jwt()
    with patch("services.graphdb.get_event_by_id", return_value=_make_peer_event(has_local_copy=True)):
        response = client.post("/events/evt-0001/import", json=VALID_IMPORT_PAYLOAD)
    assert response.status_code == 409
    _restore_jwt()


def test_import_event_no_auth_returns_401():
    """POST /events/{id}/import without auth returns 401."""
    _restore_jwt()
    response = client.post("/events/evt-0001/import", json=VALID_IMPORT_PAYLOAD)
    assert response.status_code == 401


# ── POST /events — receiver validation ───────────────────────────────────────

def _payload_with_receiver(receiver):
    return {**VALID_PAYLOAD, "receiver": receiver}


def test_create_event_missing_receiver_returns_422():
    """POST /events without receiver field returns 422."""
    _bypass_jwt()
    payload = {k: v for k, v in VALID_PAYLOAD.items() if k != "receiver"}
    response = client.post("/events", json=payload)
    assert response.status_code == 422
    _restore_jwt()


def test_create_event_unknown_receiver_returns_422():
    """POST /events with receiver that doesn't match any connection returns 422."""
    _bypass_jwt()
    with patch("services.connections.get_connection_by_peer", return_value=None):
        response = client.post("/events", json=_payload_with_receiver("node-unknown"))
    assert response.status_code == 422
    assert "receiver" in response.json()["detail"]
    _restore_jwt()


def test_create_event_inactive_receiver_returns_422():
    """POST /events with receiver that is not active returns 422."""
    _bypass_jwt()
    inactive_peer = MagicMock()
    inactive_peer.status.value = "pending_outgoing"
    with patch("services.connections.get_connection_by_peer", return_value=inactive_peer):
        response = client.post("/events", json=_payload_with_receiver("node-pending"))
    assert response.status_code == 422
    assert "receiver" in response.json()["detail"]
    _restore_jwt()


def test_create_event_active_receiver_returns_201():
    """POST /events with a valid active peer_node_id as receiver returns 201."""
    _bypass_jwt()
    active_peer = MagicMock()
    active_peer.status.value = "active"
    event = _make_event("order_created", 1)
    with (
        patch("services.connections.get_connection_by_peer", return_value=active_peer),
        patch("services.graphdb.store_event", return_value=event),
        patch("services.queue.publish_notification"),
    ):
        response = client.post("/events", json=_payload_with_receiver("node-b"))
    assert response.status_code == 201
    _restore_jwt()


def test_create_event_receiver_all_does_not_query_db():
    """POST /events with receiver='all' skips the DB lookup entirely."""
    _bypass_jwt()
    event = _make_event("order_created", 1)
    with (
        patch("services.connections.get_connection_by_peer") as mock_conn,
        patch("services.graphdb.store_event", return_value=event),
        patch("services.queue.publish_notification"),
    ):
        response = client.post("/events", json=_payload_with_receiver("all"))
    assert response.status_code == 201
    mock_conn.assert_not_called()
    _restore_jwt()
