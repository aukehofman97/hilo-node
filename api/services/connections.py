"""
Connection management service — SQLite state machine for peer relationships.

Schema:
  connections (
    id TEXT PRIMARY KEY,
    peer_node_id TEXT UNIQUE,
    peer_name TEXT,
    peer_base_url TEXT,
    peer_public_key TEXT,
    status TEXT,
    initiated_by TEXT,
    created_at TEXT,
    updated_at TEXT
  )
"""
import logging
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Optional

import httpx

from config import settings
from models.connections import ConnectionResponse, ConnectionStatus

logger = logging.getLogger(__name__)

_DB_SCHEMA = """
CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    peer_node_id TEXT UNIQUE NOT NULL,
    peer_name TEXT NOT NULL,
    peer_base_url TEXT NOT NULL,
    peer_public_key TEXT,
    status TEXT NOT NULL,
    initiated_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def init_db() -> None:
    """Create the connections table if it doesn't exist."""
    with _conn() as db:
        db.execute(_DB_SCHEMA)
        db.commit()


@contextmanager
def _conn():
    db = sqlite3.connect(settings.db_path)
    db.row_factory = sqlite3.Row
    try:
        yield db
    finally:
        db.close()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_response(row: sqlite3.Row) -> ConnectionResponse:
    return ConnectionResponse(
        id=row["id"],
        peer_node_id=row["peer_node_id"],
        peer_name=row["peer_name"],
        peer_base_url=row["peer_base_url"],
        peer_public_key=row["peer_public_key"],
        status=ConnectionStatus(row["status"]),
        initiated_by=row["initiated_by"],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
    )


# ── Read ──────────────────────────────────────────────────────────────────────

def list_connections() -> list[ConnectionResponse]:
    with _conn() as db:
        rows = db.execute("SELECT * FROM connections ORDER BY created_at DESC").fetchall()
    return [_row_to_response(r) for r in rows]


def get_connection_by_id(connection_id: str) -> Optional[ConnectionResponse]:
    with _conn() as db:
        row = db.execute(
            "SELECT * FROM connections WHERE id = ?", (connection_id,)
        ).fetchone()
    return _row_to_response(row) if row else None


def get_connection_by_peer(peer_node_id: str) -> Optional[ConnectionResponse]:
    with _conn() as db:
        row = db.execute(
            "SELECT * FROM connections WHERE peer_node_id = ?", (peer_node_id,)
        ).fetchone()
    return _row_to_response(row) if row else None


def get_active_peers() -> list[ConnectionResponse]:
    with _conn() as db:
        rows = db.execute(
            "SELECT * FROM connections WHERE status = ?", (ConnectionStatus.active,)
        ).fetchall()
    return [_row_to_response(r) for r in rows]


def get_peer_public_key(peer_node_id: str) -> Optional[str]:
    """Return the stored PEM public key for an active peer, or None."""
    with _conn() as db:
        row = db.execute(
            "SELECT peer_public_key FROM connections WHERE peer_node_id = ? AND status = ?",
            (peer_node_id, ConnectionStatus.active),
        ).fetchone()
    return row["peer_public_key"] if row else None


# ── Write ─────────────────────────────────────────────────────────────────────

def create_incoming_request(
    peer_node_id: str,
    peer_name: str,
    peer_base_url: str,
    peer_public_key: str,
) -> ConnectionResponse:
    """Store a new incoming connection request (pending_incoming)."""
    now = _now()
    connection_id = str(uuid.uuid4())
    with _conn() as db:
        db.execute(
            """INSERT INTO connections
               (id, peer_node_id, peer_name, peer_base_url, peer_public_key, status, initiated_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                connection_id,
                peer_node_id,
                peer_name,
                peer_base_url,
                peer_public_key,
                ConnectionStatus.pending_incoming,
                "them",
                now,
                now,
            ),
        )
        db.commit()
    return get_connection_by_id(connection_id)


def create_outgoing_request(
    peer_node_id: str,
    peer_name: str,
    peer_base_url: str,
) -> ConnectionResponse:
    """Store a new outgoing connection request (pending_outgoing). No public key yet."""
    now = _now()
    connection_id = str(uuid.uuid4())
    with _conn() as db:
        db.execute(
            """INSERT INTO connections
               (id, peer_node_id, peer_name, peer_base_url, peer_public_key, status, initiated_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                connection_id,
                peer_node_id,
                peer_name,
                peer_base_url,
                None,
                ConnectionStatus.pending_outgoing,
                "us",
                now,
                now,
            ),
        )
        db.commit()
    return get_connection_by_id(connection_id)


def accept_connection(connection_id: str) -> Optional[ConnectionResponse]:
    """Mark connection active. Returns updated record or None if not found."""
    now = _now()
    with _conn() as db:
        db.execute(
            "UPDATE connections SET status = ?, updated_at = ? WHERE id = ? AND status = ?",
            (ConnectionStatus.active, now, connection_id, ConnectionStatus.pending_incoming),
        )
        db.commit()
    conn = get_connection_by_id(connection_id)

    if conn and conn.status == ConnectionStatus.active:
        # Fire-and-forget acceptance callback to peer
        _send_acceptance_callback(conn)

    return conn


def _send_acceptance_callback(conn: ConnectionResponse) -> None:
    """POST /connections/accepted to peer node. Retries 3× with backoff.
    On failure, marks connection accept_pending."""
    import time

    payload = {"node_id": settings.node_id, "status": "accepted"}
    url = f"{conn.peer_base_url}/connections/accepted"

    for attempt in range(1, 4):
        try:
            resp = httpx.post(url, json=payload, timeout=5)
            if resp.is_success:
                logger.info("Acceptance callback sent to %s", conn.peer_node_id)
                return
            logger.warning(
                "Acceptance callback attempt %d/%d to %s returned %d",
                attempt, 3, conn.peer_node_id, resp.status_code,
            )
        except Exception as exc:
            logger.warning(
                "Acceptance callback attempt %d/%d to %s failed: %s",
                attempt, 3, conn.peer_node_id, exc,
            )
        if attempt < 3:
            time.sleep(2 ** attempt)

    # All retries failed — mark accept_pending
    with _conn() as db:
        db.execute(
            "UPDATE connections SET status = ?, updated_at = ? WHERE id = ?",
            (ConnectionStatus.accept_pending, _now(), conn.id),
        )
        db.commit()
    logger.error("Acceptance callback failed after 3 attempts — marked accept_pending for %s", conn.peer_node_id)


def reject_connection(connection_id: str) -> bool:
    """Mark connection rejected. Returns True if row existed."""
    now = _now()
    with _conn() as db:
        cursor = db.execute(
            "UPDATE connections SET status = ?, updated_at = ? WHERE id = ? AND status NOT IN (?, ?)",
            (
                ConnectionStatus.rejected,
                now,
                connection_id,
                ConnectionStatus.rejected,
                ConnectionStatus.active,
            ),
        )
        db.commit()
    return cursor.rowcount > 0


def mark_active_from_callback(peer_node_id: str, peer_public_key: str) -> Optional[ConnectionResponse]:
    """Called when this node receives a POST /connections/accepted callback.
    Marks connection active and stores the peer's public key."""
    now = _now()
    with _conn() as db:
        db.execute(
            """UPDATE connections
               SET status = ?, peer_public_key = ?, updated_at = ?
               WHERE peer_node_id = ? AND status IN (?, ?)""",
            (
                ConnectionStatus.active,
                peer_public_key,
                now,
                peer_node_id,
                ConnectionStatus.pending_outgoing,
                ConnectionStatus.accept_pending,
            ),
        )
        db.commit()
    return get_connection_by_peer(peer_node_id)


def resend_acceptance(connection_id: str) -> Optional[ConnectionResponse]:
    """Retry the acceptance callback for an accept_pending connection."""
    conn = get_connection_by_id(connection_id)
    if conn and conn.status == ConnectionStatus.accept_pending:
        # Re-mark active optimistically, then retry callback
        now = _now()
        with _conn() as db:
            db.execute(
                "UPDATE connections SET status = ?, updated_at = ? WHERE id = ?",
                (ConnectionStatus.active, now, connection_id),
            )
            db.commit()
        conn = get_connection_by_id(connection_id)
        _send_acceptance_callback(conn)
    return get_connection_by_id(connection_id)


def delete_connection(peer_node_id: str) -> bool:
    """Hard-delete a connection by peer node ID. Idempotent — no error if not found."""
    with _conn() as db:
        cursor = db.execute(
            "DELETE FROM connections WHERE peer_node_id = ?", (peer_node_id,)
        )
        db.commit()
    deleted = cursor.rowcount > 0
    if deleted:
        logger.info("Connection with %s deleted", peer_node_id)
    else:
        logger.info("disconnect: no connection found for %s — nothing to delete", peer_node_id)
    return deleted
