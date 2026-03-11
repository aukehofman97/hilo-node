"""Tests for queue/consumer.py — receiver-based routing logic."""
import json
from unittest.mock import patch, ANY

import pytest

from consumer import process_notification

# ── Shared test fixtures ───────────────────────────────────────────────────────

PEER_A = {"peer_node_id": "node-a", "peer_base_url": "http://node-a:8000", "status": "active"}
PEER_B = {"peer_node_id": "node-b", "peer_base_url": "http://node-b:8000", "status": "active"}


def _notification(receiver: str) -> bytes:
    return json.dumps({
        "event_id": "evt-0001",
        "event_type": "order_created",
        "source_node": "node-a",
        "subject": "http://hilo.semantics.io/events/order-0001",
        "created_at": "2026-03-11T10:00:00+00:00",
        "data_url": "http://node-a:8000/events/evt-0001",
        "receiver": receiver,
    }).encode()


# ── Tests ──────────────────────────────────────────────────────────────────────

def test_broadcast_forwards_to_all_peers():
    """receiver='all' with two active peers → _forward_to_peer called for each."""
    with (
        patch("consumer._get_active_peers", return_value=[PEER_A, PEER_B]),
        patch("consumer._forward_to_peer", return_value=True) as mock_fwd,
    ):
        result = process_notification(_notification("all"))

    assert result is True
    assert mock_fwd.call_count == 2
    mock_fwd.assert_any_call("http://node-a:8000", ANY)
    mock_fwd.assert_any_call("http://node-b:8000", ANY)


def test_unicast_forwards_to_targeted_peer_only():
    """receiver=node-b → only node-b receives the forward call; node-a does not."""
    with (
        patch("consumer._get_active_peers", return_value=[PEER_A, PEER_B]),
        patch("consumer._forward_to_peer", return_value=True) as mock_fwd,
    ):
        result = process_notification(_notification("node-b"))

    assert result is True
    mock_fwd.assert_called_once_with("http://node-b:8000", ANY)


def test_unknown_receiver_logs_warning_acks_without_forwarding():
    """receiver=<unknown> → warning logged, _forward_to_peer not called, returns True (ACK)."""
    with (
        patch("consumer._get_active_peers", return_value=[PEER_A, PEER_B]),
        patch("consumer._forward_to_peer", return_value=True) as mock_fwd,
        patch("consumer.logger") as mock_logger,
    ):
        result = process_notification(_notification("node-unknown"))

    assert result is True
    mock_fwd.assert_not_called()
    mock_logger.warning.assert_called_once()


def test_broadcast_with_zero_peers_acks_without_forwarding():
    """receiver='all' with no active peers → _forward_to_peer not called, returns True (ACK)."""
    with (
        patch("consumer._get_active_peers", return_value=[]),
        patch("consumer._forward_to_peer", return_value=True) as mock_fwd,
    ):
        result = process_notification(_notification("all"))

    assert result is True
    mock_fwd.assert_not_called()
