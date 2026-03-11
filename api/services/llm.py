"""LLM service — translates natural-language questions to SPARQL SELECT queries.

Uses Claude Sonnet 4.6 via the Anthropic SDK. The API key is read from
settings.anthropic_api_key (mapped from HILO_ANTHROPIC_API_KEY in the container).
"""
import re

import anthropic

from config import settings

# ─── System prompt ────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a SPARQL query generator for the HILO semantic data platform.

## Ontology

Namespace: http://hilo.semantics.io/ontology/  (prefix: hilo:)
Event subjects: http://hilo.semantics.io/events/  (prefix: event:)

Key classes:
  hilo:Event       — a logistics event stored in the graph
  hilo:Order       — a shipment order

Key predicates on hilo:Event:
  hilo:eventType   xsd:string    — type of event, e.g. "order_created", "shipment_update"
  hilo:timestamp   xsd:dateTime  — when the event occurred
  hilo:sourceNode  xsd:string    — originating node ID, e.g. "node-a"
  hilo:payload     xsd:string    — optional raw payload

Key predicates on hilo:Order:
  hilo:orderId     xsd:string    — unique order identifier
  hilo:status      xsd:string    — "created" | "in_transit" | "delivered" | "cancelled"
  hilo:createdAt   xsd:dateTime  — order creation timestamp

## Rules

1. ONLY generate SELECT queries. Never generate INSERT, UPDATE, DELETE, or DROP.
2. Always use the full namespace http://hilo.semantics.io/ontology/ (not a PREFIX shorthand unless you declare it).
3. Use descriptive variable names, e.g. ?orderId, ?status, ?eventType — not ?s ?p ?o.
4. Add ORDER BY DESC(?createdAt) or ORDER BY DESC(?timestamp) for time-based queries.
5. Add LIMIT 50 if the user did not specify a limit.
6. Return ONLY the raw SPARQL query — no explanation, no markdown fences.

## Examples

Question: show me the latest 5 events
Answer:
SELECT ?event ?eventType ?timestamp ?sourceNode
WHERE {
  ?event a <http://hilo.semantics.io/ontology/Event> ;
         <http://hilo.semantics.io/ontology/eventType> ?eventType ;
         <http://hilo.semantics.io/ontology/timestamp> ?timestamp .
  OPTIONAL { ?event <http://hilo.semantics.io/ontology/sourceNode> ?sourceNode }
}
ORDER BY DESC(?timestamp)
LIMIT 5

Question: what orders are currently in transit?
Answer:
SELECT ?order ?orderId ?createdAt
WHERE {
  ?order a <http://hilo.semantics.io/ontology/Order> ;
         <http://hilo.semantics.io/ontology/orderId> ?orderId ;
         <http://hilo.semantics.io/ontology/status> "in_transit" .
  OPTIONAL { ?order <http://hilo.semantics.io/ontology/createdAt> ?createdAt }
}
ORDER BY DESC(?createdAt)
LIMIT 50

Question: how many events per type are there?
Answer:
SELECT ?eventType (COUNT(?event) AS ?count)
WHERE {
  ?event a <http://hilo.semantics.io/ontology/Event> ;
         <http://hilo.semantics.io/ontology/eventType> ?eventType .
}
GROUP BY ?eventType
ORDER BY DESC(?count)
"""

# ─── Public function ──────────────────────────────────────────────────────────

def translate_to_sparql(question: str) -> str:
    """Translate a natural-language question into a SPARQL SELECT query.

    Raises:
        ValueError: if the LLM response is not a SELECT query.
        anthropic.APIError: if the Anthropic API call fails.
    """
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=600,
        timeout=30.0,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": question}],
    )

    raw = message.content[0].text.strip()

    # Strip markdown fences if the model wraps the query despite instructions
    raw = _strip_fences(raw)

    _validate_select(raw)

    return raw


def _strip_fences(text: str) -> str:
    """Remove ```sparql ... ``` or ``` ... ``` fences."""
    fenced = re.match(r"^```(?:sparql)?\s*\n?(.*?)\n?```\s*$", text, re.DOTALL | re.IGNORECASE)
    if fenced:
        return fenced.group(1).strip()
    return text


def _validate_select(query: str) -> None:
    """Raise ValueError if query is not a SELECT (or SELECT-like aggregate)."""
    # Strip leading whitespace and comments before checking
    stripped = re.sub(r"^(\s*(#[^\n]*)?\n)*", "", query).lstrip()
    if not stripped.upper().startswith("SELECT"):
        raise ValueError(
            f"Only SELECT queries are supported. Got: {stripped[:60]!r}"
        )
