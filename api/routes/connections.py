"""
Connection management endpoints.

POST /connections/request          — Node B calls on Node A to initiate
POST /connections/outgoing         — Record an outgoing request we sent to a peer
GET  /connections                  — List all connections (local, no auth)
GET  /connections/{peer}/token     — Get fresh RS256 JWT for peer
POST /connections/{id}/accept      — Operator accepts incoming request
POST /connections/{id}/reject      — Operator rejects incoming request
POST /connections/accepted         — Callback from accepting node
POST /connections/{id}/resend      — Retry acceptance callback (accept_pending)
"""
import logging

from fastapi import APIRouter, HTTPException

from config import settings
from models.connections import (
    AcceptedCallback,
    ConnectionRequest,
    ConnectionResponse,
    OutgoingConnectionRequest,
    TokenResponse,
)
from services import connections as conn_svc
from services.jwt_service import sign_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/connections", tags=["connections"])


@router.post("/request", response_model=ConnectionResponse, status_code=201)
def request_connection(body: ConnectionRequest):
    """Node B calls this on Node A to initiate a connection."""
    existing = conn_svc.get_connection_by_peer(body.node_id)
    if existing:
        raise HTTPException(status_code=409, detail="Connection request already exists")

    connection = conn_svc.create_incoming_request(
        peer_node_id=body.node_id,
        peer_name=body.name,
        peer_base_url=body.base_url,
        peer_public_key=body.public_key,
    )
    logger.info("Incoming connection request from %s (%s)", body.node_id, body.base_url)
    return connection


@router.post("/outgoing", response_model=ConnectionResponse, status_code=201)
def record_outgoing_request(body: OutgoingConnectionRequest):
    """Record a connection request WE sent to a peer (pending_outgoing).

    Called by the UI immediately after successfully POSTing to the peer's /connections/request,
    so that this node tracks the outgoing request and the peer's acceptance callback can
    find a matching record.
    """
    existing = conn_svc.get_connection_by_peer(body.peer_node_id)
    if existing:
        raise HTTPException(status_code=409, detail="Connection already exists for this peer")

    connection = conn_svc.create_outgoing_request(
        peer_node_id=body.peer_node_id,
        peer_name=body.peer_name,
        peer_base_url=body.peer_base_url,
    )
    logger.info("Recorded outgoing connection request to %s (%s)", body.peer_node_id, body.peer_base_url)
    return connection


@router.get("", response_model=list[ConnectionResponse])
def list_connections():
    return conn_svc.list_connections()


@router.get("/{peer_node_id}/token", response_model=TokenResponse)
def get_token(peer_node_id: str):
    """Generate a fresh RS256 JWT signed with this node's private key for the named peer."""
    peer = conn_svc.get_connection_by_peer(peer_node_id)
    if not peer or peer.status.value != "active":
        raise HTTPException(status_code=404, detail="Active peer connection not found")

    token, expires_at = sign_token(audience=peer_node_id)
    return TokenResponse(
        token=token,
        expires_at=expires_at,
        peer_url=peer.peer_base_url,
    )


@router.post("/{connection_id}/accept", response_model=ConnectionResponse)
def accept_connection(connection_id: str):
    """Operator action — accept an incoming pending request."""
    conn = conn_svc.get_connection_by_id(connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    if conn.status.value != "pending_incoming":
        raise HTTPException(status_code=400, detail=f"Cannot accept connection in status {conn.status}")

    updated = conn_svc.accept_connection(connection_id)
    if updated is None:
        raise HTTPException(status_code=500, detail="Failed to update connection")
    return updated


@router.post("/{connection_id}/reject", status_code=204)
def reject_connection(connection_id: str):
    """Operator action — reject an incoming pending request."""
    conn = conn_svc.get_connection_by_id(connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")
    if conn.status.value == "active":
        raise HTTPException(status_code=400, detail="Cannot reject an active connection")

    success = conn_svc.reject_connection(connection_id)
    if not success:
        raise HTTPException(status_code=400, detail="Connection cannot be rejected")


@router.post("/accepted", response_model=ConnectionResponse)
def connection_accepted(body: AcceptedCallback):
    """Callback — called by accepting node (Node A) to notify Node B.

    Node B marks connection active and fetches Node A's public key from /.well-known/hilo-node.
    """
    import httpx

    peer = conn_svc.get_connection_by_peer(body.node_id)
    if not peer:
        raise HTTPException(status_code=404, detail=f"No pending connection for {body.node_id}")

    # Fetch accepting node's public key from its .well-known endpoint
    peer_public_key = None
    well_known_url = f"{peer.peer_base_url}/.well-known/hilo-node"
    try:
        resp = httpx.get(well_known_url, timeout=5)
        resp.raise_for_status()
        identity = resp.json()
        peer_public_key = identity.get("public_key")
        logger.info("Fetched public key for %s from %s", body.node_id, well_known_url)
    except Exception as exc:
        logger.warning(
            "Could not fetch public key for %s from %s: %s — marking active without key",
            body.node_id, well_known_url, exc,
        )

    updated = conn_svc.mark_active_from_callback(
        peer_node_id=body.node_id,
        peer_public_key=peer_public_key or "",
    )
    if not updated:
        raise HTTPException(status_code=400, detail="Could not activate connection")
    return updated


@router.post("/{connection_id}/resend", response_model=ConnectionResponse)
def resend_acceptance(connection_id: str):
    """Retry the acceptance callback for an accept_pending connection."""
    updated = conn_svc.resend_acceptance(connection_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Connection not found or not in accept_pending state")
    return updated


@router.post("/{peer_node_id}/disconnect", status_code=200)
def disconnect(peer_node_id: str):
    """Remove a connection and notify the peer.

    Notifies the peer via POST /connections/{this_node_id}/disconnected, then hard-deletes
    locally regardless of whether the peer is reachable.
    """
    import httpx

    conn = conn_svc.get_connection_by_peer(peer_node_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    # Notify peer — fire-and-forget, don't block on failure
    try:
        url = f"{conn.peer_base_url}/connections/{settings.node_id}/disconnected"
        resp = httpx.post(url, timeout=5)
        if not resp.is_success:
            logger.warning("Peer %s returned %d on disconnected notify", peer_node_id, resp.status_code)
        else:
            logger.info("Peer %s notified of disconnect", peer_node_id)
    except Exception as exc:
        logger.warning("Could not notify peer %s of disconnect: %s — deleting locally anyway", peer_node_id, exc)

    conn_svc.delete_connection(peer_node_id)
    return {"status": "disconnected", "peer": peer_node_id}


@router.post("/{node_id}/disconnected", status_code=200)
def peer_disconnected(node_id: str):
    """Peer notifies us that they have removed the connection.

    Intentionally unauthenticated in V2 — consistent with /bridge/receive.
    Idempotent: returns 200 even if no connection exists.
    V3: add sender JWT verification.
    """
    conn_svc.delete_connection(node_id)
    return {"status": "ok"}
