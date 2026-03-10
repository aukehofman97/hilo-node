"""Tests for POST /data and GET /data endpoints."""
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

VALID_TURTLE = "@prefix ex: <http://example.org/> .\nex:thing a ex:Thing ."

MOCK_SPARQL_RESULT = {
    "results": {
        "bindings": [
            {"s": {"type": "uri", "value": "http://example.org/thing"}}
        ]
    }
}


# ── POST /data ────────────────────────────────────────────────────────────────

def test_insert_data_success():
    """POST /data with valid Turtle returns 201."""
    with patch("services.graphdb.insert_turtle"):
        response = client.post("/data", json={"triples": VALID_TURTLE})
    assert response.status_code == 201
    assert response.json() == {"status": "inserted"}


def test_insert_data_empty_triples():
    """POST /data with empty triples string is accepted by the route (GraphDB handles semantics)."""
    with patch("services.graphdb.insert_turtle"):
        response = client.post("/data", json={"triples": ""})
    assert response.status_code == 201


def test_insert_data_missing_body_returns_422():
    """POST /data with no body returns 422."""
    response = client.post("/data")
    assert response.status_code == 422


def test_insert_data_missing_triples_field_returns_422():
    """POST /data with body missing the triples field returns 422."""
    response = client.post("/data", json={"other_field": "value"})
    assert response.status_code == 422


def test_insert_data_graphdb_failure_returns_500():
    """POST /data returns 500 when GraphDB raises."""
    with patch("services.graphdb.insert_turtle", side_effect=Exception("Connection refused")):
        response = client.post("/data", json={"triples": VALID_TURTLE})
    assert response.status_code == 500
    assert "Connection refused" in response.json()["detail"]


def test_insert_data_graphdb_failure_logs_insert_failed():
    """POST /data GraphDB failure emits logger.error with 'insert failed'."""
    with (
        patch("services.graphdb.insert_turtle", side_effect=Exception("DB error")),
        patch("routes.data.logger") as mock_logger,
    ):
        client.post("/data", json={"triples": VALID_TURTLE})
    mock_logger.error.assert_called_once()
    assert "insert failed" in mock_logger.error.call_args[0][0]


def test_insert_data_graphdb_failure_log_includes_exception():
    """POST /data error log includes the exception detail."""
    exc = Exception("Turtle parse error")
    with (
        patch("services.graphdb.insert_turtle", side_effect=exc),
        patch("routes.data.logger") as mock_logger,
    ):
        client.post("/data", json={"triples": "invalid turtle"})
    call_args = mock_logger.error.call_args
    # Second arg is the exception itself
    assert exc in call_args[0] or str(exc) in str(call_args)


# ── GET /data ─────────────────────────────────────────────────────────────────

def test_query_data_success():
    """GET /data with valid SPARQL returns 200 and results."""
    with patch("services.graphdb.query_data", return_value=MOCK_SPARQL_RESULT):
        response = client.get("/data", params={"sparql": "SELECT * WHERE { ?s ?p ?o }"})
    assert response.status_code == 200
    assert response.json() == MOCK_SPARQL_RESULT


def test_query_data_empty_results():
    """GET /data returns empty bindings when no results found."""
    empty = {"results": {"bindings": []}}
    with patch("services.graphdb.query_data", return_value=empty):
        response = client.get("/data", params={"sparql": "SELECT * WHERE { ?s ?p ?o }"})
    assert response.status_code == 200
    assert response.json()["results"]["bindings"] == []


def test_query_data_missing_sparql_param_returns_422():
    """GET /data without sparql query param returns 422."""
    response = client.get("/data")
    assert response.status_code == 422


def test_query_data_graphdb_failure_returns_500():
    """GET /data returns 500 when GraphDB raises."""
    with patch("services.graphdb.query_data", side_effect=Exception("SPARQL syntax error")):
        response = client.get("/data", params={"sparql": "INVALID SPARQL"})
    assert response.status_code == 500
    assert "SPARQL syntax error" in response.json()["detail"]


def test_query_data_graphdb_failure_logs_query_failed():
    """GET /data GraphDB failure emits logger.error with 'query failed'."""
    with (
        patch("services.graphdb.query_data", side_effect=Exception("Timeout")),
        patch("routes.data.logger") as mock_logger,
    ):
        client.get("/data", params={"sparql": "SELECT * WHERE { ?s ?p ?o }"})
    mock_logger.error.assert_called_once()
    assert "query failed" in mock_logger.error.call_args[0][0]


def test_query_data_graphdb_failure_log_includes_exception():
    """GET /data error log includes the exception detail."""
    exc = Exception("Repository not found")
    with (
        patch("services.graphdb.query_data", side_effect=exc),
        patch("routes.data.logger") as mock_logger,
    ):
        client.get("/data", params={"sparql": "SELECT * WHERE { ?s ?p ?o }"})
    call_args = mock_logger.error.call_args
    assert exc in call_args[0] or str(exc) in str(call_args)


def test_insert_and_query_are_independent():
    """Insert and query failures produce different log messages."""
    insert_exc = Exception("insert error")
    query_exc = Exception("query error")

    with (
        patch("services.graphdb.insert_turtle", side_effect=insert_exc),
        patch("routes.data.logger") as mock_logger,
    ):
        client.post("/data", json={"triples": VALID_TURTLE})
    assert "insert failed" in mock_logger.error.call_args[0][0]

    with (
        patch("services.graphdb.query_data", side_effect=query_exc),
        patch("routes.data.logger") as mock_logger2,
    ):
        client.get("/data", params={"sparql": "SELECT * WHERE { ?s ?p ?o }"})
    assert "query failed" in mock_logger2.error.call_args[0][0]
