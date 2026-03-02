"""
JWT service — sign and verify RS256 tokens for inter-node authentication.

Sign: this node signs tokens with its private RSA key.
Verify: peer tokens are verified against the peer's stored public key.

Upgrade path to V4 (EU Wallet VCs):
  Change verify_token to resolve the public key from a DID document
  instead of SQLite. JWT format, signing, and API contract stay identical.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import settings

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)


def _load_private_key():
    """Load RSA private key from disk. Called once per request (file is cached by OS)."""
    from cryptography.hazmat.primitives.serialization import load_pem_private_key

    with open(settings.private_key_path, "rb") as f:
        return load_pem_private_key(f.read(), password=None)


def _load_public_key_pem() -> str:
    """Return this node's public key as PEM string."""
    pub_path = settings.private_key_path + ".pub"
    with open(pub_path, "r") as f:
        return f.read()


def sign_token(audience: str) -> tuple[str, datetime]:
    """Sign a fresh RS256 JWT for the given audience (peer_node_id).

    Returns (token_string, expires_at).
    """
    private_key = _load_private_key()
    aud = audience
    issuer = settings.node_id
    expiry_minutes = settings.jwt_expiry_minutes

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=expiry_minutes)

    payload = {
        "iss": issuer,
        "aud": aud,
        "iat": now,
        "exp": expires_at,
    }

    token = jwt.encode(payload, private_key, algorithm="RS256")
    return token, expires_at


def verify_token(token: str, peer_public_key_pem: str) -> dict:
    """Verify an RS256 JWT against the peer's public key.

    Raises jwt.PyJWTError on any failure (expired, bad sig, wrong aud).
    Returns the decoded payload on success.
    """
    from cryptography.hazmat.primitives.serialization import load_pem_public_key

    public_key = load_pem_public_key(peer_public_key_pem.encode())
    audience = settings.jwt_audience or settings.node_id

    return jwt.decode(
        token,
        public_key,
        algorithms=["RS256"],
        audience=audience,
    )


def require_jwt(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> dict:
    """FastAPI dependency — validate Bearer token on protected endpoints.

    Accepts:
      - HILO_INTERNAL_KEY bearer token (local UI bypass)
      - Valid RS256 JWT signed by a known connected peer

    Raises 401 on missing/invalid/expired token.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    # Internal key bypass (local UI / dev)
    if token == settings.internal_key:
        return {"sub": "internal", "iss": settings.node_id}

    # RS256 JWT — look up issuer's public key from active connections
    from services.connections import get_peer_public_key

    try:
        # Decode without verification first to extract issuer
        unverified = jwt.decode(token, options={"verify_signature": False})
        peer_node_id = unverified.get("iss")
        if not peer_node_id:
            raise ValueError("Missing iss claim")

        peer_pub_key = get_peer_public_key(peer_node_id)
        if not peer_pub_key:
            raise ValueError(f"No public key for peer {peer_node_id!r}")

        return verify_token(token, peer_pub_key)

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except (jwt.PyJWTError, ValueError) as exc:
        logger.debug("JWT verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )
