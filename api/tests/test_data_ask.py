"""Tests for POST /data/ask endpoint."""
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

# ── Fixtures ──────────────────────────────────────────────────────────────────

VALID_SPARQL = (
    "SELECT ?event ?eventType WHERE { "
    "?event <http://hilo.semantics.io/ontology/eventType> ?eventType } LIMIT 10"
)

FIXTURE_RESULTS = {
    "head": {"vars": ["event", "eventType"]},
    "results": {
        "bindings": [
            {
                "event": {"type": "uri", "value": "http://hilo.semantics.io/events/evt-0001"},
                "eventType": {"type": "literal", "value": "order_created"},
            }
        ]
    },
}

# ── Tests ─────────────────────────────────────────────────────────────────────

def test_ask_returns_501_when_api_key_not_set():
    """POST /data/ask returns 501 when ANTHROPIC_API_KEY is not configured."""
    with patch("routes.data.settings") as mock_settings:
        mock_settings.anthropic_api_key = ""
        response = client.post("/data/ask", json={"question": "show me events"})
    assert response.status_code == 501
    assert "not configured" in response.json()["detail"].lower()


def test_ask_success_with_mocked_llm():
    """POST /data/ask returns 200 with sparql and results when LLM and GraphDB succeed."""
    with (
        patch("routes.data.settings") as mock_settings,
        patch("routes.data.llm.translate_to_sparql", return_value=VALID_SPARQL),
        patch("routes.data.graphdb.query_data", return_value=FIXTURE_RESULTS),
    ):
        mock_settings.anthropic_api_key = "sk-test"
        response = client.post("/data/ask", json={"question": "show me events"})

    assert response.status_code == 200
    body = response.json()
    assert body["sparql"] == VALID_SPARQL
    assert body["results"] == FIXTURE_RESULTS
    assert body["error"] is None


def test_ask_llm_error_returns_200_with_error_field():
    """POST /data/ask returns HTTP 200 with error field when LLM raises an exception."""
    with (
        patch("routes.data.settings") as mock_settings,
        patch("routes.data.llm.translate_to_sparql", side_effect=Exception("Anthropic API unreachable")),
    ):
        mock_settings.anthropic_api_key = "sk-test"
        response = client.post("/data/ask", json={"question": "show me events"})

    assert response.status_code == 200
    body = response.json()
    assert body["sparql"] is None
    assert body["results"] is None
    assert body["error"] is not None
    assert "Anthropic API unreachable" in body["error"]


def test_ask_non_select_query_returns_200_with_error_field():
    """POST /data/ask returns HTTP 200 with error field when LLM returns a non-SELECT query."""
    with (
        patch("routes.data.settings") as mock_settings,
        patch(
            "routes.data.llm.translate_to_sparql",
            side_effect=ValueError("Only SELECT queries are supported. Got: 'DELETE WHERE { ?s ?p ?o }'"),
        ),
    ):
        mock_settings.anthropic_api_key = "sk-test"
        response = client.post("/data/ask", json={"question": "delete everything"})

    assert response.status_code == 200
    body = response.json()
    assert body["results"] is None
    assert body["error"] is not None
    assert "SELECT" in body["error"]
