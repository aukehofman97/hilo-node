from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel


class ConnectionStatus(str, Enum):
    pending_outgoing = "pending_outgoing"
    pending_incoming = "pending_incoming"
    active = "active"
    accept_pending = "accept_pending"  # callback to peer failed
    rejected = "rejected"
    suspended = "suspended"


class ConnectionRequest(BaseModel):
    """Body for POST /connections/request — sent by Node B to Node A."""
    node_id: str
    name: str
    base_url: str
    public_key: str  # PEM-encoded RSA public key


class AcceptedCallback(BaseModel):
    """Body for POST /connections/accepted — sent by Node A to Node B after accepting."""
    node_id: str
    status: str = "accepted"


class ConnectionResponse(BaseModel):
    """Returned by GET /connections and related endpoints."""
    id: str
    peer_node_id: str
    peer_name: str
    peer_base_url: str
    peer_public_key: Optional[str]
    status: ConnectionStatus
    initiated_by: str  # "us" | "them"
    created_at: datetime
    updated_at: datetime


class NodeIdentity(BaseModel):
    """Returned by GET /.well-known/hilo-node."""
    node_id: str
    name: str
    base_url: str
    public_key: str  # PEM-encoded RSA public key
    version: str = "2"


class TokenResponse(BaseModel):
    """Returned by GET /connections/{peer_node_id}/token."""
    token: str
    expires_at: datetime
    peer_url: str
