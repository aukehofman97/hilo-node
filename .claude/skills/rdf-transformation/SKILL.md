---
name: rdf-transformation
description: Transform data between legacy formats (JSON, XML, CSV, EDI) and RDF, write SPARQL queries, and create SHACL validation shapes. Use when working with RDF triples, Turtle syntax, JSON-LD, SPARQL queries, ontology modeling, SHACL shapes, or the semantic adapter that maps legacy data to RDF. Use when user says "RDF", "triples", "Turtle", "SPARQL", "SHACL", "ontology", "linked data", "JSON-LD", "transform to RDF", "mapping", or "semantic adapter". Do NOT use for API endpoints that serve RDF data (use api-development skill), frontend rendering of RDF (use frontend-design skill), or Docker setup of GraphDB (use docker skill).
compatibility: Requires Python 3.12+ with RDFLib. GraphDB instance (Ontotext GraphDB Free) accessible via SPARQL endpoint.
metadata:
  author: HILO Semantics
  version: 1.0.0
---

# RDF / Semantic Data Transformation

This skill covers the semantic core of HILO: transforming legacy data into RDF, querying it with SPARQL, and validating it with SHACL. The semantic adapter — the component that bridges legacy systems and the node — lives here.

## Tech Stack

- **RDF library**: RDFLib (Python) for in-memory graph manipulation and serialization
- **SPARQL client**: SPARQLWrapper for querying Ontotext GraphDB over HTTP
- **Validation**: pySHACL for SHACL shape validation
- **Serialization formats**: Turtle (primary), JSON-LD (for API responses), N-Triples (for bulk loading)
- **Triple store**: Ontotext GraphDB Free (port 7200, SPARQL endpoint at `/repositories/{repo}`)

## Performance Note

RDF and SPARQL require precision. A wrong prefix, a missing angle bracket, or an incorrect datatype will silently produce wrong results. Take your time. Validate every query and every generated triple before storing.

## Instructions

### Step 1: Understand the data model

Before writing any transformation, know what you're transforming. Every RDF statement is a triple: subject → predicate → object. Subjects and predicates are always URIs. Objects can be URIs (links to other resources) or literals (values like strings, numbers, dates).

HILO uses a shared ontology to define what concepts mean. In V1, we use sample data with a placeholder ontology. The ontology will be formalized later, but the structure stays the same.

### Step 2: Define prefixes

Every RDF file starts with prefix declarations. Use consistent prefixes across the project. See `references/rdf-patterns.md` for the standard HILO prefix set.

CRITICAL: Never use full URIs inline when a prefix is defined. Always use prefixed names (`ex:order-123` not `<http://example.org/order-123>`). This keeps triples readable.

### Step 3: Transform legacy data to RDF

The semantic adapter takes structured input (JSON, XML, CSV) and produces RDF triples. The flow:

1. Parse the input format
2. Map each field to an ontology concept (subject, predicate, object)
3. Generate RDF triples using RDFLib
4. Validate the output against SHACL shapes
5. Serialize to Turtle for storage or JSON-LD for API response

HILO uses AI to create deterministic mappings. Once a mapping is defined, it runs automatically. The mapping configuration defines which input field maps to which RDF predicate.

### Step 4: Write SPARQL queries

Use SPARQLWrapper to query GraphDB. Common query types:

- **SELECT**: retrieve specific values (returns tabular data)
- **CONSTRUCT**: build a new graph from existing data (returns triples)
- **ASK**: check if a pattern exists (returns boolean)
- **INSERT DATA**: add new triples
- **DELETE DATA**: remove specific triples

CRITICAL: Always parameterize queries. Never concatenate user input into SPARQL strings — use variable binding or sanitize inputs to prevent injection.

### Step 5: Validate with SHACL

SHACL shapes define what valid data looks like: required properties, datatypes, cardinality, value ranges. Run validation before storing any new triples.

If validation fails: reject the data and return a meaningful error describing which shape was violated and why. Never store invalid triples.

### Step 6: Verify

After any transformation or query:
- Inspect the output triples — are subjects, predicates, and objects correct?
- Run SHACL validation on generated triples
- Test SPARQL queries in GraphDB Workbench (port 7200) before putting them in code
- Check that prefixes resolve correctly

## Examples

**Example 1: "Transform a JSON order into RDF"**

Actions:
1. Parse the JSON: `{ "id": "ORD-123", "status": "created", "customer": "Acme Corp" }`
2. Map fields to ontology: id → subject URI, status → predicate + literal, customer → predicate + URI
3. Generate Turtle output
4. Validate against Order SHACL shape
5. Store via SPARQL INSERT

Result: Valid RDF triples stored in GraphDB, queryable via SPARQL.

**Example 2: "Write a SPARQL query to get all orders with status 'created'"**

Actions:
1. Write SELECT query with WHERE clause matching the status predicate
2. Test in GraphDB Workbench
3. Wrap in SPARQLWrapper call in `services/graphdb.py`

Result: Working query returning matching orders as JSON.

**Example 3: "Create a SHACL shape for an Order event"**

Actions:
1. Define NodeShape targeting Order class
2. Add PropertyShapes: id (required, string), status (required, from allowed values), created_at (required, dateTime)
3. Save as Turtle file in `graphdb/shapes/`
4. Test with pySHACL against sample data

Result: SHACL shape that validates Order events and rejects invalid ones with clear error messages.

## Troubleshooting

**Error: SPARQL query returns empty results**
Cause: Wrong prefix, wrong predicate URI, or data not yet inserted.
Solution: Check prefixes match exactly. Test the query in GraphDB Workbench with the visual query builder. Verify data exists with a simple `SELECT * WHERE { ?s ?p ?o } LIMIT 10`.

**Error: SHACL validation fails unexpectedly**
Cause: Datatype mismatch (e.g. string where integer expected) or missing required property.
Solution: Check the SHACL shape's `sh:datatype` and `sh:minCount`. Compare against the actual triples being validated.

**Error: RDFLib serialization produces malformed Turtle**
Cause: Literal value containing special characters, or missing namespace binding.
Solution: Bind all namespaces before serializing. Escape special characters in literals. Use `graph.serialize(format='turtle')` and inspect the output.

**Error: GraphDB rejects INSERT**
Cause: Malformed SPARQL UPDATE syntax, or writing to a read-only endpoint.
Solution: Use the `/repositories/{repo}/statements` endpoint for updates, not the query endpoint. Check SPARQL UPDATE syntax — INSERT DATA does not use a WHERE clause.

## References

For code patterns (RDFLib examples, SPARQL templates, SHACL shapes, mapping configurations), see `references/rdf-patterns.md`.
