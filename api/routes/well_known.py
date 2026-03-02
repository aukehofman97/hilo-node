"""
GET /.well-known/hilo-node — public node identity endpoint.

Returns this node's identity (node_id, name, base_url, RSA public key).
Used by peers during connection handshake to discover and verify this node.
No authentication required — public endpoint.
"""
import logging
import os

from fastapi import APIRouter, HTTPException

from config import settings
from models.connections import NodeIdentity

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/.well-known/hilo-node", response_model=NodeIdentity)
def get_node_identity() -> NodeIdentity:
    pub_key_path = settings.private_key_path + ".pub"
    if not os.path.exists(pub_key_path):
        raise HTTPException(
            status_code=503,
            detail="Node public key not yet generated — node is still starting up",
        )

    with open(pub_key_path, "r") as f:
        public_key_pem = f.read()

    return NodeIdentity(
        node_id=settings.node_id,
        name=settings.node_name,
        base_url=settings.node_base_url,
        public_key=public_key_pem,
    )
