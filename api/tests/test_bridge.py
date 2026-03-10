"""Tests for POST /bridge/receive."""
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

VALID_NOTIFICATION = {
    "event_id": "evt-0001",
    "event_type": "order_created",
    "source_node": "node-b",
    "subject": "http://hilo.semantics.io/events/order-0001",
    "created_at": "2026-03-01T12:00:00",
    "data_url": "http://node-b:8000/events/evt-0001",
}


# ── POST /bridge/receive ──────────────────────────────────────────────────────

def test_receive_notification_success():
    """POST /bridge/receive with valid payload returns 200."""
    with patch("services.graphdb.store_notification"):
        response = client.post("/bridge/receive", json=VALID_NOTIFICATION)
    assert response.status_code == 200
    assert response.json() == {"status": "received", "event_id": "evt-0001"}


def test_receive_notification_returns_event_id():
    """Response includes the event_id from the notification."""
    with patch("services.graphdb.store_notification"):
        response = client.post("/bridge/receive", json={**VALID_NOTIFICATION, "event_id": "evt-9999"})
    assert response.json()["event_id"] == "evt-9999"


def test_receive_notification_logs_info():
    """Successful receive emits logger.info with event_id and source_node."""
    with (
        patch("services.graphdb.store_notification"),
        patch("routes.bridge.logger") as mock_logger,
    ):
        client.post("/bridge/receive", json=VALID_NOTIFICATION)
    mock_logger.info.assert_called_once()
    log_call = str(mock_logger.info.call_args)
    assert "evt-0001" in log_call
    assert "node-b" in log_call


def test_receive_notification_missing_event_id_returns_422():
    """POST /bridge/receive without event_id returns 422."""
    payload = {k: v for k, v in VALID_NOTIFICATION.items() if k != "event_id"}
    response = client.post("/bridge/receive", json=payload)
    assert response.status_code == 422


def test_receive_notification_missing_source_node_returns_422():
    """POST /bridge/receive without source_node returns 422."""
    payload = {k: v for k, v in VALID_NOTIFICATION.items() if k != "source_node"}
    response = client.post("/bridge/receive", json=payload)
    assert response.status_code == 422


def test_receive_notification_missing_data_url_returns_422():
    """POST /bridge/receive without data_url returns 422."""
    payload = {k: v for k, v in VALID_NOTIFICATION.items() if k != "data_url"}
    response = client.post("/bridge/receive", json=payload)
    assert response.status_code == 422


def test_receive_notification_empty_body_returns_422():
    """POST /bridge/receive with empty body returns 422."""
    response = client.post("/bridge/receive", json={})
    assert response.status_code == 422


def test_receive_notification_graphdb_failure_returns_500():
    """POST /bridge/receive returns 500 when GraphDB store fails.

    Uses raise_server_exceptions=False because the bridge route has no error handling —
    unhandled exceptions are returned as 500 by FastAPI's default exception handler.
    """
    lenient_client = TestClient(app, raise_server_exceptions=False)
    with patch("services.graphdb.store_notification", side_effect=Exception("GraphDB down")):
        response = lenient_client.post("/bridge/receive", json=VALID_NOTIFICATION)
    assert response.status_code == 500


def test_receive_notification_is_unauthenticated():
    """POST /bridge/receive accepts requests without any Authorization header."""
    with patch("services.graphdb.store_notification"):
        response = client.post("/bridge/receive", json=VALID_NOTIFICATION)
    assert response.status_code == 200


def test_receive_notification_stores_to_graphdb():
    """store_notification is called exactly once per request."""
    with patch("services.graphdb.store_notification") as mock_store:
        client.post("/bridge/receive", json=VALID_NOTIFICATION)
    mock_store.assert_called_once()
