import logging
import uuid
from datetime import datetime

import httpx

from config import settings
from models.events import EventCreate, EventNotification, EventResponse

logger = logging.getLogger(__name__)

PREFIXES = """
PREFIX hilo: <http://hilo.semantics.io/ontology/>
PREFIX event: <http://hilo.semantics.io/events/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
"""


def _sparql_endpoint() -> str:
    if settings.graphdb_backend == "fuseki":
        return f"{settings.graphdb_url}/{settings.graphdb_repository}/query"
    return f"{settings.graphdb_url}/repositories/{settings.graphdb_repository}"


def _sparql_update_endpoint() -> str:
    if settings.graphdb_backend == "fuseki":
        return f"{settings.graphdb_url}/{settings.graphdb_repository}/update"
    return f"{settings.graphdb_url}/repositories/{settings.graphdb_repository}/statements"


def _health_url() -> str:
    if settings.graphdb_backend == "fuseki":
        return f"{settings.graphdb_url}/$/ping"
    return f"{settings.graphdb_url}/rest/repositories"


def check_health() -> str:
    try:
        resp = httpx.get(_health_url(), timeout=5)
        resp.raise_for_status()
        return "ok"
    except Exception as exc:
        raise RuntimeError(f"Triple store unreachable: {exc}") from exc


def store_event(event: EventCreate) -> EventResponse:
    event_id = str(uuid.uuid4())
    created_at = datetime.utcnow()
    # source_node stamped server-side — callers do not assert their own identity
    source_node = settings.node_id

    triples_escaped = (
        event.triples
        .replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "\\r")
    )
    subject_escaped = event.subject.replace('"', '\\"')

    meta_turtle = f"""
@prefix hilo: <http://hilo.semantics.io/ontology/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<http://hilo.semantics.io/events/meta/{event_id}> a hilo:Event ;
    hilo:eventId "{event_id}" ;
    hilo:sourceNode "{source_node}" ;
    hilo:eventType "{event.event_type}" ;
    hilo:subject "{subject_escaped}" ;
    hilo:createdAt "{created_at.isoformat()}Z"^^xsd:dateTime ;
    hilo:triplesPayload "{triples_escaped}" .
"""

    insert_turtle(meta_turtle)
    insert_turtle(event.triples)

    return EventResponse(
        id=event_id,
        source_node=source_node,
        event_type=event.event_type,
        subject=event.subject,
        triples=event.triples,
        created_at=created_at,
        links={"self": f"/events/{event_id}"},
    )


def store_notification(notification: EventNotification) -> None:
    """Store an incoming EventNotification from a peer node.

    Writes metadata only — no triples. The data_url can be used to fetch
    the full event from the source node on demand.
    """
    subject_escaped = notification.subject.replace('"', '\\"')
    data_url_escaped = notification.data_url.replace('"', '\\"')

    meta_turtle = f"""
@prefix hilo: <http://hilo.semantics.io/ontology/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<http://hilo.semantics.io/events/meta/{notification.event_id}> a hilo:Event ;
    hilo:eventId "{notification.event_id}" ;
    hilo:sourceNode "{notification.source_node}" ;
    hilo:eventType "{notification.event_type}" ;
    hilo:subject "{subject_escaped}" ;
    hilo:createdAt "{notification.created_at.isoformat()}"^^xsd:dateTime ;
    hilo:dataUrl "{data_url_escaped}" .
"""
    insert_turtle(meta_turtle)


def _turtle_data_endpoint() -> str:
    """Direct Turtle upload endpoint (used for Fuseki; falls back to SPARQL UPDATE for GraphDB)."""
    if settings.graphdb_backend == "fuseki":
        return f"{settings.graphdb_url}/{settings.graphdb_repository}/data"
    return None  # GraphDB uses SPARQL UPDATE


def insert_turtle(triples: str) -> None:
    if settings.graphdb_backend == "fuseki":
        # Fuseki accepts raw Turtle via POST /dataset/data
        endpoint = _turtle_data_endpoint()
        try:
            resp = httpx.post(
                endpoint,
                content=triples.encode(),
                headers={"Content-Type": "text/turtle"},
                timeout=10,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.error("Fuseki INSERT failed: %s — %s", exc.response.status_code, exc.response.text)
            raise
    else:
        # GraphDB: SPARQL UPDATE with prefixes converted to SPARQL PREFIX syntax
        endpoint = _sparql_update_endpoint()
        seen_prefixes: dict[str, str] = {}
        body_lines = []
        for line in triples.splitlines():
            stripped = line.strip()
            if stripped.startswith("@prefix"):
                # @prefix foo: <...> .  →  PREFIX foo: <...>
                sparql_prefix = "PREFIX" + stripped[7:].rstrip(" .")
                parts = sparql_prefix.split()
                prefix_name = parts[1] if len(parts) > 1 else sparql_prefix
                seen_prefixes[prefix_name] = sparql_prefix
            else:
                body_lines.append(line)
        insert_query = "\n".join(seen_prefixes.values()) + f"\nINSERT DATA {{\n" + "\n".join(body_lines) + "\n}"
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


def _sparql_update(sparql: str) -> None:
    """Execute a SPARQL UPDATE against the configured triple store."""
    endpoint = _sparql_update_endpoint()
    try:
        resp = httpx.post(
            endpoint,
            data={"update": sparql},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=10,
        )
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.error("SPARQL UPDATE failed: %s — %s", exc.response.status_code, exc.response.text)
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


def get_events(
    since: str | None = None,
    event_type: str | None = None,
    limit: int = 50,
) -> list[EventResponse]:
    filters = []
    if since:
        filters.append(f'FILTER(?createdAt >= "{since}"^^xsd:dateTime)')
    if event_type:
        filters.append(f'FILTER(?eventType = "{event_type}")')
    filter_block = "\n    ".join(filters)

    sparql = f"""
{PREFIXES}
SELECT ?eventId ?sourceNode ?eventType ?subject ?createdAt ?hasLocalCopy WHERE {{
    ?event a hilo:Event ;
           hilo:eventId ?eventId ;
           hilo:sourceNode ?sourceNode ;
           hilo:eventType ?eventType ;
           hilo:createdAt ?createdAt .
    OPTIONAL {{ ?event hilo:subject ?subject . }}
    OPTIONAL {{ ?event hilo:triplesPayload ?tp . }}
    BIND(BOUND(?tp) AS ?hasLocalCopy)
    {filter_block}
}}
ORDER BY DESC(?createdAt)
LIMIT {limit}
"""
    results = query_data(sparql)
    events = []
    for binding in results.get("results", {}).get("bindings", []):
        events.append(
            EventResponse(
                id=binding["eventId"]["value"],
                source_node=binding["sourceNode"]["value"],
                event_type=binding["eventType"]["value"],
                subject=binding.get("subject", {}).get("value", ""),
                triples="",
                created_at=datetime.fromisoformat(
                    binding["createdAt"]["value"].replace("Z", "+00:00")
                ),
                links={"self": f"/events/{binding['eventId']['value']}"},
                has_local_copy=binding.get("hasLocalCopy", {}).get("value", "false") == "true",
            )
        )
    return events


def get_event_by_id(event_id: str) -> EventResponse | None:
    sparql = f"""
{PREFIXES}
SELECT ?sourceNode ?eventType ?subject ?createdAt ?triplesPayload ?dataUrl WHERE {{
    <http://hilo.semantics.io/events/meta/{event_id}> a hilo:Event ;
           hilo:sourceNode ?sourceNode ;
           hilo:eventType ?eventType ;
           hilo:createdAt ?createdAt .
    OPTIONAL {{ <http://hilo.semantics.io/events/meta/{event_id}> hilo:subject ?subject . }}
    OPTIONAL {{ <http://hilo.semantics.io/events/meta/{event_id}> hilo:triplesPayload ?triplesPayload . }}
    OPTIONAL {{ <http://hilo.semantics.io/events/meta/{event_id}> hilo:dataUrl ?dataUrl . }}
}}
"""
    results = query_data(sparql)
    bindings = results.get("results", {}).get("bindings", [])
    if not bindings:
        return None
    b = bindings[0]
    links: dict = {"self": f"/events/{event_id}"}
    if data_url := b.get("dataUrl", {}).get("value"):
        links["data"] = data_url
    return EventResponse(
        id=event_id,
        source_node=b["sourceNode"]["value"],
        event_type=b["eventType"]["value"],
        subject=b.get("subject", {}).get("value", ""),
        triples=b.get("triplesPayload", {}).get("value", ""),
        created_at=datetime.fromisoformat(b["createdAt"]["value"].replace("Z", "+00:00")),
        links=links,
        has_local_copy=bool(b.get("triplesPayload", {}).get("value")),
    )


def import_event_triples(event_id: str, triples: str) -> None:
    """Import RDF triples for a peer notification into the local triple store.

    Write order (critical):
      1. insert_turtle — idempotent; safe to retry
      2. SPARQL UPDATE metadata — only after triples confirmed stored
    If (2) fails, event stays as 'received' and user can retry cleanly.
    """
    # Step 1: Insert the actual RDF triples first (idempotent on retry)
    insert_turtle(triples)

    # Step 2: Add hilo:triplesPayload to the existing event metadata subject
    triples_escaped = (
        triples
        .replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "\\r")
    )
    sparql = f"""
PREFIX hilo: <http://hilo.semantics.io/ontology/>
INSERT DATA {{
    <http://hilo.semantics.io/events/meta/{event_id}> hilo:triplesPayload "{triples_escaped}" .
}}
"""
    _sparql_update(sparql)
