"""Tests for GET /queue/stats."""
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


MOCK_STATS = {
    "messages_ready": 3,
    "messages_unacked": 1,
    "consumers": 2,
    "dead_letters": 0,
    "throughput_per_minute": 12.0,
    "consumer_details": [
        {
            "id": "consumer-1",
            "status": "active",
            "connected_at": "127.0.0.1:55001 -> 127.0.0.1:5672",
            "messages_processed": 0.5,
        }
    ],
}


def test_queue_stats_success():
    """Returns live stats when management API is reachable."""
    with patch("services.rabbitmq_management.get_queue_stats", return_value=MOCK_STATS):
        response = client.get("/queue/stats")
    assert response.status_code == 200
    data = response.json()
    assert data["messages_ready"] == 3
    assert data["dead_letters"] == 0
    assert data["consumers"] == 2
    assert len(data["consumer_details"]) == 1


def test_queue_stats_management_unavailable():
    """Returns null fields (not 503) when management API is down.

    The queue stats endpoint is a monitoring read: partial data is more
    useful than a hard failure, so the service layer returns None for each
    field rather than raising.
    """
    null_stats = {
        "messages_ready": None,
        "messages_unacked": None,
        "consumers": None,
        "dead_letters": None,
        "throughput_per_minute": None,
        "consumer_details": [],
    }
    with patch("services.rabbitmq_management.get_queue_stats", return_value=null_stats):
        response = client.get("/queue/stats")
    assert response.status_code == 200
    data = response.json()
    assert data["messages_ready"] is None
    assert data["consumer_details"] == []


def test_queue_stats_with_dead_letters():
    """Dead-letter count is surfaced correctly."""
    stats = {**MOCK_STATS, "dead_letters": 5}
    with patch("services.rabbitmq_management.get_queue_stats", return_value=stats):
        response = client.get("/queue/stats")
    assert response.status_code == 200
    assert response.json()["dead_letters"] == 5
