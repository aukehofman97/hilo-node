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

## Ontology conventions

Namespace: http://hilo.semantics.io/ontology/  (prefix: hilo:)
Subject namespace: http://hilo.semantics.io/events/  (prefix: event:)

The graph is open-world: any class or predicate may exist depending on what users have stored.
Class names follow PascalCase: hilo:Order, hilo:Document, hilo:Shipment, hilo:Invoice, etc.
Predicate names follow camelCase: hilo:orderId, hilo:documentId, hilo:status, hilo:createdAt, etc.

## How to map a user question to a query

1. Identify the concept the user is asking about (e.g. "documents" → hilo:Document, "orders" → hilo:Order, "shipments" → hilo:Shipment).
2. Use that class in the WHERE clause: ?subject a <hilo:ClassName> .
3. Use OPTIONAL for every predicate — you do not know which properties a given instance has.
4. Select the most likely ID predicate as a required field only if it clearly exists (e.g. hilo:documentId for documents, hilo:orderId for orders). Otherwise make it OPTIONAL too.
5. If the user's question is generic ("what is in the graph?", "show me everything"), use ?subject ?predicate ?object with no class filter.

## Rules

1. ONLY generate SELECT queries. Never generate INSERT, UPDATE, DELETE, or DROP.
2. Always use full URIs: <http://hilo.semantics.io/ontology/ClassName>. Do not use PREFIX shorthands.
3. Use descriptive variable names (?document, ?documentId, ?status) — not ?s ?p ?o.
4. Add ORDER BY DESC(?createdAt) when the class likely has a createdAt predicate; otherwise omit ORDER BY.
5. Add LIMIT 50 unless the user specified a limit.
6. Return ONLY the raw SPARQL query — no explanation, no markdown fences.
7. NEVER add property filters unless the user explicitly states a value.
   - "show me submitted documents" → no status filter; "submitted" is a noun, not a filter value
   - "documents with status submitted" → filter hilo:status "submitted"
   Use OPTIONAL for all non-mandatory properties so rows are not dropped when a field is absent.

## Examples

Question: show me all orders
Answer:
SELECT ?order ?orderId ?status ?createdAt
WHERE {
  ?order a <http://hilo.semantics.io/ontology/Order> .
  OPTIONAL { ?order <http://hilo.semantics.io/ontology/orderId> ?orderId }
  OPTIONAL { ?order <http://hilo.semantics.io/ontology/status> ?status }
  OPTIONAL { ?order <http://hilo.semantics.io/ontology/createdAt> ?createdAt }
}
ORDER BY DESC(?createdAt)
LIMIT 50

Question: what orders are currently in transit?
Answer:
SELECT ?order ?orderId ?createdAt
WHERE {
  ?order a <http://hilo.semantics.io/ontology/Order> ;
         <http://hilo.semantics.io/ontology/status> "in_transit" .
  OPTIONAL { ?order <http://hilo.semantics.io/ontology/orderId> ?orderId }
  OPTIONAL { ?order <http://hilo.semantics.io/ontology/createdAt> ?createdAt }
}
ORDER BY DESC(?createdAt)
LIMIT 50

Question: which documents are submitted
Answer:
SELECT ?document ?documentId ?documentType ?status ?createdAt
WHERE {
  ?document a <http://hilo.semantics.io/ontology/Document> .
  OPTIONAL { ?document <http://hilo.semantics.io/ontology/documentId> ?documentId }
  OPTIONAL { ?document <http://hilo.semantics.io/ontology/documentType> ?documentType }
  OPTIONAL { ?document <http://hilo.semantics.io/ontology/status> ?status }
  OPTIONAL { ?document <http://hilo.semantics.io/ontology/createdAt> ?createdAt }
}
ORDER BY DESC(?createdAt)
LIMIT 50

Question: show me all shipments
Answer:
SELECT ?shipment ?status ?origin ?createdAt
WHERE {
  ?shipment a <http://hilo.semantics.io/ontology/Shipment> .
  OPTIONAL { ?shipment <http://hilo.semantics.io/ontology/status> ?status }
  OPTIONAL { ?shipment <http://hilo.semantics.io/ontology/origin> ?origin }
  OPTIONAL { ?shipment <http://hilo.semantics.io/ontology/createdAt> ?createdAt }
}
ORDER BY DESC(?createdAt)
LIMIT 50

Question: show me the latest 5 events
Answer:
SELECT ?event ?eventType ?timestamp ?sourceNode
WHERE {
  ?event a <http://hilo.semantics.io/ontology/Event> .
  OPTIONAL { ?event <http://hilo.semantics.io/ontology/eventType> ?eventType }
  OPTIONAL { ?event <http://hilo.semantics.io/ontology/timestamp> ?timestamp }
  OPTIONAL { ?event <http://hilo.semantics.io/ontology/sourceNode> ?sourceNode }
}
ORDER BY DESC(?timestamp)
LIMIT 5

Question: how many events per type are there?
Answer:
SELECT ?eventType (COUNT(?event) AS ?count)
WHERE {
  ?event a <http://hilo.semantics.io/ontology/Event> ;
         <http://hilo.semantics.io/ontology/eventType> ?eventType .
}
GROUP BY ?eventType
ORDER BY DESC(?count)

Question: what is in the graph?
Answer:
SELECT DISTINCT ?type (COUNT(?subject) AS ?count)
WHERE {
  ?subject a ?type .
}
GROUP BY ?type
ORDER BY DESC(?count)
LIMIT 50
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
