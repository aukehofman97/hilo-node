"""Tests for connection management endpoints."""
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from main import app
from models.connections import ConnectionResponse, ConnectionStatus

client = TestClient(app)


# ── Fixtures ──────────────────────────────────────────────────────────────────

def _make_conn(
    status: ConnectionStatus = ConnectionStatus.pending_incoming,
    conn_id: str = "conn-0001",
    peer_node_id: str = "node-b",
    initiated_by: str = "them",
    peer_public_key: str = "-----BEGIN PUBLIC KEY-----\nMIIBIjAN",
) -> ConnectionResponse:
    return ConnectionResponse(
        id=conn_id,
        peer_node_id=peer_node_id,
        peer_name="Node B",
        peer_base_url="http://node-b:8000",
        peer_public_key=peer_public_key,
        status=status,
        initiated_by=initiated_by,
        created_at=datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc),
        updated_at=datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc),
    )


VALID_REQUEST_BODY = {
    "node_id": "node-b",
    "name": "Node B",
    "base_url": "http://node-b:8000",
    "public_key": "-----BEGIN PUBLIC KEY-----\nMIIBIjAN",
}

VALID_OUTGOING_BODY = {
    "peer_node_id": "node-b",
    "peer_name": "Node B",
    "peer_base_url": "http://node-b:8000",
}


# ── POST /connections/request ─────────────────────────────────────────────────

def test_request_connection_success():
    """New incoming request from peer returns 201 with connection record."""
    conn = _make_conn()
    with (
        patch("services.connections.get_connection_by_peer", return_value=None),
        patch("services.connections.create_incoming_request", return_value=conn),
    ):
        response = client.post("/connections/request", json=VALID_REQUEST_BODY)
    assert response.status_code == 201
    assert response.json()["peer_node_id"] == "node-b"
    assert response.json()["status"] == "pending_incoming"


def test_request_connection_logs_info():
    """Incoming connection request emits logger.info."""
    conn = _make_conn()
    with (
        patch("services.connections.get_connection_by_peer", return_value=None),
        patch("services.connections.create_incoming_request", return_value=conn),
        patch("routes.connections.logger") as mock_logger,
    ):
        client.post("/connections/request", json=VALID_REQUEST_BODY)
    mock_logger.info.assert_called_once()
    assert "node-b" in str(mock_logger.info.call_args)


def test_request_connection_duplicate_returns_409():
    """Duplicate connection request returns 409."""
    with patch("services.connections.get_connection_by_peer", return_value=_make_conn()):
        response = client.post("/connections/request", json=VALID_REQUEST_BODY)
    assert response.status_code == 409


def test_request_connection_missing_fields_returns_422():
    """Incomplete request body returns 422."""
    response = client.post("/connections/request", json={"node_id": "node-b"})
    assert response.status_code == 422


def test_request_connection_empty_body_returns_422():
    """Empty body returns 422."""
    response = client.post("/connections/request", json={})
    assert response.status_code == 422


# ── POST /connections/outgoing ────────────────────────────────────────────────

def test_record_outgoing_success():
    """Recording an outgoing request returns 201."""
    conn = _make_conn(status=ConnectionStatus.pending_outgoing, initiated_by="us")
    with (
        patch("services.connections.get_connection_by_peer", return_value=None),
        patch("services.connections.create_outgoing_request", return_value=conn),
    ):
        response = client.post("/connections/outgoing", json=VALID_OUTGOING_BODY)
    assert response.status_code == 201
    assert response.json()["status"] == "pending_outgoing"


def test_record_outgoing_logs_info():
    """Recording outgoing request emits logger.info."""
    conn = _make_conn(status=ConnectionStatus.pending_outgoing, initiated_by="us")
    with (
        patch("services.connections.get_connection_by_peer", return_value=None),
        patch("services.connections.create_outgoing_request", return_value=conn),
        patch("routes.connections.logger") as mock_logger,
    ):
        client.post("/connections/outgoing", json=VALID_OUTGOING_BODY)
    mock_logger.info.assert_called_once()
    assert "node-b" in str(mock_logger.info.call_args)


def test_record_outgoing_duplicate_returns_409():
    """Duplicate outgoing request returns 409."""
    with patch("services.connections.get_connection_by_peer", return_value=_make_conn()):
        response = client.post("/connections/outgoing", json=VALID_OUTGOING_BODY)
    assert response.status_code == 409


def test_record_outgoing_missing_fields_returns_422():
    """Incomplete body returns 422."""
    response = client.post("/connections/outgoing", json={"peer_node_id": "node-b"})
    assert response.status_code == 422


# ── GET /connections ──────────────────────────────────────────────────────────

def test_list_connections_empty():
    """Returns empty list when no connections exist."""
    with patch("services.connections.list_connections", return_value=[]):
        response = client.get("/connections")
    assert response.status_code == 200
    assert response.json() == []


def test_list_connections_returns_all():
    """Returns all connections."""
    conns = [
        _make_conn(conn_id="conn-0001", peer_node_id="node-b"),
        _make_conn(conn_id="conn-0002", peer_node_id="node-c"),
    ]
    with patch("services.connections.list_connections", return_value=conns):
        response = client.get("/connections")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_list_connections_no_auth_required():
    """GET /connections is unauthenticated."""
    with patch("services.connections.list_connections", return_value=[]):
        response = client.get("/connections")
    assert response.status_code == 200


# ── GET /connections/{peer_node_id}/token ─────────────────────────────────────

def test_get_token_success():
    """Active peer connection returns a token."""
    active_conn = _make_conn(status=ConnectionStatus.active)
    with (
        patch("services.connections.get_connection_by_peer", return_value=active_conn),
        patch(
            "routes.connections.sign_token",
            return_value=("jwt.token.here", datetime(2026, 3, 10, 11, 0, 0, tzinfo=timezone.utc)),
        ),
    ):
        response = client.get("/connections/node-b/token")
    assert response.status_code == 200
    data = response.json()
    assert data["token"] == "jwt.token.here"
    assert data["peer_url"] == "http://node-b:8000"


def test_get_token_peer_not_found_returns_404():
    """Unknown peer returns 404."""
    with patch("services.connections.get_connection_by_peer", return_value=None):
        response = client.get("/connections/unknown-node/token")
    assert response.status_code == 404


def test_get_token_inactive_peer_returns_404():
    """Non-active connection returns 404."""
    pending = _make_conn(status=ConnectionStatus.pending_incoming)
    with patch("services.connections.get_connection_by_peer", return_value=pending):
        response = client.get("/connections/node-b/token")
    assert response.status_code == 404


# ── POST /connections/{id}/accept ─────────────────────────────────────────────

def test_accept_connection_success():
    """Accepting a pending_incoming connection returns 200 with updated record."""
    pending = _make_conn(status=ConnectionStatus.pending_incoming)
    active = _make_conn(status=ConnectionStatus.active)
    with (
        patch("services.connections.get_connection_by_id", return_value=pending),
        patch("services.connections.accept_connection", return_value=active),
    ):
        response = client.post("/connections/conn-0001/accept")
    assert response.status_code == 200
    assert response.json()["status"] == "active"


def test_accept_connection_logs_info():
    """Successful accept emits logger.info with connection_id and peer_node_id."""
    pending = _make_conn(status=ConnectionStatus.pending_incoming)
    active = _make_conn(status=ConnectionStatus.active)
    with (
        patch("services.connections.get_connection_by_id", return_value=pending),
        patch("services.connections.accept_connection", return_value=active),
        patch("routes.connections.logger") as mock_logger,
    ):
        client.post("/connections/conn-0001/accept")
    mock_logger.info.assert_called_once()
    log_call = str(mock_logger.info.call_args)
    assert "conn-0001" in log_call
    assert "node-b" in log_call


def test_accept_connection_not_found_returns_404():
    """Accept on unknown connection_id returns 404."""
    with patch("services.connections.get_connection_by_id", return_value=None):
        response = client.post("/connections/nonexistent/accept")
    assert response.status_code == 404


def test_accept_connection_wrong_status_returns_400():
    """Accepting a non-pending_incoming connection returns 400."""
    active = _make_conn(status=ConnectionStatus.active)
    with patch("services.connections.get_connection_by_id", return_value=active):
        response = client.post("/connections/conn-0001/accept")
    assert response.status_code == 400


def test_accept_connection_service_failure_returns_500():
    """Returns 500 when accept_connection service returns None."""
    pending = _make_conn(status=ConnectionStatus.pending_incoming)
    with (
        patch("services.connections.get_connection_by_id", return_value=pending),
        patch("services.connections.accept_connection", return_value=None),
    ):
        response = client.post("/connections/conn-0001/accept")
    assert response.status_code == 500


# ── POST /connections/{id}/reject ─────────────────────────────────────────────

def test_reject_connection_success():
    """Rejecting a pending connection returns 204."""
    pending = _make_conn(status=ConnectionStatus.pending_incoming)
    with (
        patch("services.connections.get_connection_by_id", return_value=pending),
        patch("services.connections.reject_connection", return_value=True),
    ):
        response = client.post("/connections/conn-0001/reject")
    assert response.status_code == 204


def test_reject_connection_logs_info():
    """Successful reject emits logger.info with connection_id."""
    pending = _make_conn(status=ConnectionStatus.pending_incoming)
    with (
        patch("services.connections.get_connection_by_id", return_value=pending),
        patch("services.connections.reject_connection", return_value=True),
        patch("routes.connections.logger") as mock_logger,
    ):
        client.post("/connections/conn-0001/reject")
    mock_logger.info.assert_called_once()
    assert "conn-0001" in str(mock_logger.info.call_args)


def test_reject_connection_not_found_returns_404():
    """Reject on unknown connection_id returns 404."""
    with patch("services.connections.get_connection_by_id", return_value=None):
        response = client.post("/connections/nonexistent/reject")
    assert response.status_code == 404


def test_reject_active_connection_returns_400():
    """Rejecting an active connection returns 400."""
    active = _make_conn(status=ConnectionStatus.active)
    with patch("services.connections.get_connection_by_id", return_value=active):
        response = client.post("/connections/conn-0001/reject")
    assert response.status_code == 400


def test_reject_connection_service_failure_returns_400():
    """Returns 400 when reject_connection service returns False."""
    pending = _make_conn(status=ConnectionStatus.pending_incoming)
    with (
        patch("services.connections.get_connection_by_id", return_value=pending),
        patch("services.connections.reject_connection", return_value=False),
    ):
        response = client.post("/connections/conn-0001/reject")
    assert response.status_code == 400


# ── POST /connections/accepted (callback) ─────────────────────────────────────

VALID_ACCEPTED_BODY = {"node_id": "node-a", "status": "accepted"}


def test_connection_accepted_success():
    """Accepted callback activates the connection."""
    pending = _make_conn(status=ConnectionStatus.pending_outgoing, peer_node_id="node-a")
    active = _make_conn(status=ConnectionStatus.active, peer_node_id="node-a")

    mock_resp = MagicMock()
    mock_resp.raise_for_status.return_value = None
    mock_resp.json.return_value = {"public_key": "-----BEGIN PUBLIC KEY-----\nMIIBIjAN"}

    with (
        patch("services.connections.get_connection_by_peer", return_value=pending),
        patch("httpx.get", return_value=mock_resp),
        patch("services.connections.mark_active_from_callback", return_value=active),
    ):
        response = client.post("/connections/accepted", json=VALID_ACCEPTED_BODY)
    assert response.status_code == 200
    assert response.json()["status"] == "active"


def test_connection_accepted_peer_not_found_returns_404():
    """Callback for unknown peer returns 404."""
    with patch("services.connections.get_connection_by_peer", return_value=None):
        response = client.post("/connections/accepted", json=VALID_ACCEPTED_BODY)
    assert response.status_code == 404


def test_connection_accepted_well_known_failure_still_activates():
    """If well-known fetch fails, connection is still activated (no public key)."""
    pending = _make_conn(status=ConnectionStatus.pending_outgoing, peer_node_id="node-a")
    active = _make_conn(status=ConnectionStatus.active, peer_node_id="node-a")

    with (
        patch("services.connections.get_connection_by_peer", return_value=pending),
        patch("httpx.get", side_effect=Exception("unreachable")),
        patch("services.connections.mark_active_from_callback", return_value=active),
    ):
        response = client.post("/connections/accepted", json=VALID_ACCEPTED_BODY)
    assert response.status_code == 200


def test_connection_accepted_mark_active_fails_returns_400():
    """Returns 400 when mark_active_from_callback returns None."""
    pending = _make_conn(status=ConnectionStatus.pending_outgoing, peer_node_id="node-a")

    mock_resp = MagicMock()
    mock_resp.raise_for_status.return_value = None
    mock_resp.json.return_value = {"public_key": "-----BEGIN PUBLIC KEY-----"}

    with (
        patch("services.connections.get_connection_by_peer", return_value=pending),
        patch("httpx.get", return_value=mock_resp),
        patch("services.connections.mark_active_from_callback", return_value=None),
    ):
        response = client.post("/connections/accepted", json=VALID_ACCEPTED_BODY)
    assert response.status_code == 400


# ── POST /connections/{id}/resend ─────────────────────────────────────────────

def test_resend_acceptance_success():
    """Resend acceptance for accept_pending connection returns updated connection."""
    active = _make_conn(status=ConnectionStatus.active)
    with patch("services.connections.resend_acceptance", return_value=active):
        response = client.post("/connections/conn-0001/resend")
    assert response.status_code == 200


def test_resend_acceptance_not_found_returns_404():
    """Resend for unknown or non-accept_pending connection returns 404."""
    with patch("services.connections.resend_acceptance", return_value=None):
        response = client.post("/connections/conn-0001/resend")
    assert response.status_code == 404


# ── POST /connections/{peer}/disconnect ───────────────────────────────────────

def test_disconnect_success():
    """Disconnecting a peer deletes locally and notifies peer."""
    conn = _make_conn(status=ConnectionStatus.active)

    mock_resp = MagicMock()
    mock_resp.is_success = True
    mock_resp.status_code = 200

    with (
        patch("services.connections.get_connection_by_peer", return_value=conn),
        patch("httpx.post", return_value=mock_resp),
        patch("services.connections.delete_connection"),
    ):
        response = client.post("/connections/node-b/disconnect")
    assert response.status_code == 200
    assert response.json() == {"status": "disconnected", "peer": "node-b"}


def test_disconnect_not_found_returns_404():
    """Disconnect for unknown peer returns 404."""
    with patch("services.connections.get_connection_by_peer", return_value=None):
        response = client.post("/connections/unknown/disconnect")
    assert response.status_code == 404


def test_disconnect_peer_notify_failure_still_deletes():
    """If peer notify fails, local deletion still proceeds."""
    conn = _make_conn(status=ConnectionStatus.active)

    with (
        patch("services.connections.get_connection_by_peer", return_value=conn),
        patch("httpx.post", side_effect=Exception("peer unreachable")),
        patch("services.connections.delete_connection") as mock_delete,
    ):
        response = client.post("/connections/node-b/disconnect")
    assert response.status_code == 200
    mock_delete.assert_called_once_with("node-b")


def test_disconnect_peer_returns_error_logs_warning():
    """Non-success from peer notify emits logger.warning but still succeeds."""
    conn = _make_conn(status=ConnectionStatus.active)

    mock_resp = MagicMock()
    mock_resp.is_success = False
    mock_resp.status_code = 503

    with (
        patch("services.connections.get_connection_by_peer", return_value=conn),
        patch("httpx.post", return_value=mock_resp),
        patch("services.connections.delete_connection"),
        patch("routes.connections.logger") as mock_logger,
    ):
        response = client.post("/connections/node-b/disconnect")
    assert response.status_code == 200
    mock_logger.warning.assert_called()


# ── POST /connections/{node_id}/disconnected ──────────────────────────────────

def test_peer_disconnected_success():
    """Peer disconnect callback deletes connection and returns 200."""
    with patch("services.connections.delete_connection"):
        response = client.post("/connections/node-b/disconnected")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_peer_disconnected_idempotent():
    """Peer disconnect is idempotent — returns 200 even if no connection exists."""
    with patch("services.connections.delete_connection", return_value=False):
        response = client.post("/connections/unknown-node/disconnected")
    assert response.status_code == 200


def test_peer_disconnected_no_auth_required():
    """Peer disconnect callback is intentionally unauthenticated."""
    with patch("services.connections.delete_connection"):
        response = client.post("/connections/node-b/disconnected")
    assert response.status_code == 200
