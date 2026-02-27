import logging
import uuid
from datetime import datetime

import httpx

from config import settings
from models.events import EventCreate, EventResponse

logger = logging.getLogger(__name__)

PREFIXES = """
PREFIX hilo: <http://hilo.semantics.io/ontology/>
PREFIX event: <http://hilo.semantics.io/events/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
"""


def _sparql_endpoint() -> str:
    return f"{settings.graphdb_url}/repositories/{settings.graphdb_repository}"


def _sparql_update_endpoint() -> str:
    return f"{settings.graphdb_url}/repositories/{settings.graphdb_repository}/statements"


def check_health() -> str:
    try:
        resp = httpx.get(f"{settings.graphdb_url}/rest/repositories", timeout=5)
        resp.raise_for_status()
        return "ok"
    except Exception as exc:
        raise RuntimeError(f"GraphDB unreachable: {exc}") from exc


def store_event(event: EventCreate) -> EventResponse:
    event_id = str(uuid.uuid4())
    created_at = datetime.utcnow()

    meta_turtle = f"""
@prefix hilo: <http://hilo.semantics.io/ontology/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<http://hilo.semantics.io/events/meta/{event_id}> a hilo:Event ;
    hilo:eventId "{event_id}" ;
    hilo:sourceNode "{event.source_node}" ;
    hilo:eventType "{event.event_type}" ;
    hilo:createdAt "{created_at.isoformat()}Z"^^xsd:dateTime .
"""

    combined_turtle = meta_turtle + "\n" + event.triples

    insert_turtle(combined_turtle)

    return EventResponse(
        id=event_id,
        source_node=event.source_node,
        event_type=event.event_type,
        triples=event.triples,
        created_at=created_at,
        links={"self": f"/events/{event_id}"},
    )


def insert_turtle(triples: str) -> None:
    endpoint = _sparql_update_endpoint()
    insert_query = f"""INSERT DATA {{
{triples}
}}"""
    try:
        resp = httpx.post(
            endpoint,
            data={"update": insert_query},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=10,
        )
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.error("GraphDB INSERT failed: %s — %s", exc.response.status_code, exc.response.text)
        raise


def query_data(sparql: str) -> dict:
    endpoint = _sparql_endpoint()
    try:
        resp = httpx.get(
            endpoint,
            params={"query": sparql},
            headers={"Accept": "application/sparql-results+json"},
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as exc:
        logger.error("GraphDB QUERY failed: %s — %s", exc.response.status_code, exc.response.text)
        raise


def get_events(since: str | None = None) -> list[EventResponse]:
    time_filter = ""
    if since:
        time_filter = f'FILTER(?createdAt >= "{since}"^^xsd:dateTime)'

    sparql = f"""
{PREFIXES}
SELECT ?eventId ?sourceNode ?eventType ?createdAt WHERE {{
    ?event a hilo:Event ;
           hilo:eventId ?eventId ;
           hilo:sourceNode ?sourceNode ;
           hilo:eventType ?eventType ;
           hilo:createdAt ?createdAt .
    {time_filter}
}}
ORDER BY DESC(?createdAt)
LIMIT 100
"""
    results = query_data(sparql)
    events = []
    for binding in results.get("results", {}).get("bindings", []):
        events.append(
            EventResponse(
                id=binding["eventId"]["value"],
                source_node=binding["sourceNode"]["value"],
                event_type=binding["eventType"]["value"],
                triples="",
                created_at=datetime.fromisoformat(
                    binding["createdAt"]["value"].replace("Z", "+00:00")
                ),
                links={"self": f"/events/{binding['eventId']['value']}"},
            )
        )
    return events


def get_event_by_id(event_id: str) -> EventResponse | None:
    sparql = f"""
{PREFIXES}
SELECT ?sourceNode ?eventType ?createdAt WHERE {{
    <http://hilo.semantics.io/events/meta/{event_id}> a hilo:Event ;
           hilo:sourceNode ?sourceNode ;
           hilo:eventType ?eventType ;
           hilo:createdAt ?createdAt .
}}
"""
    results = query_data(sparql)
    bindings = results.get("results", {}).get("bindings", [])
    if not bindings:
        return None
    b = bindings[0]
    return EventResponse(
        id=event_id,
        source_node=b["sourceNode"]["value"],
        event_type=b["eventType"]["value"],
        triples="",
        created_at=datetime.fromisoformat(b["createdAt"]["value"].replace("Z", "+00:00")),
        links={"self": f"/events/{event_id}"},
    )
