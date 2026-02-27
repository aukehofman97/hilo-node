# RDF Patterns Reference

Detailed code patterns for RDF transformation, SPARQL queries, and SHACL validation in HILO Node.

## Standard Prefixes

Use these consistently across all RDF files and SPARQL queries:

```turtle
@prefix hilo:  <http://hilo.semantics.io/ontology/> .
@prefix event: <http://hilo.semantics.io/events/> .
@prefix org:   <http://hilo.semantics.io/organisations/> .
@prefix xsd:   <http://www.w3.org/2001/XMLSchema#> .
@prefix rdf:   <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs:  <http://www.w3.org/2000/01/rdf-schema#> .
@prefix sh:    <http://www.w3.org/ns/shacl#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
```

In Python (RDFLib):
```python
from rdflib import Namespace

HILO = Namespace("http://hilo.semantics.io/ontology/")
EVENT = Namespace("http://hilo.semantics.io/events/")
ORG = Namespace("http://hilo.semantics.io/organisations/")
```

## Transforming JSON to RDF (RDFLib)

```python
import json
from rdflib import Graph, Literal, URIRef, Namespace
from rdflib.namespace import RDF, XSD

HILO = Namespace("http://hilo.semantics.io/ontology/")
EVENT = Namespace("http://hilo.semantics.io/events/")

def json_to_rdf(json_data: dict) -> Graph:
    """Transform a JSON order into RDF triples."""
    g = Graph()
    g.bind("hilo", HILO)
    g.bind("event", EVENT)

    # Create subject URI from ID
    order_uri = EVENT[f"order-{json_data['id']}"]

    # Add type
    g.add((order_uri, RDF.type, HILO.Order))

    # Map fields to predicates
    g.add((order_uri, HILO.orderId, Literal(json_data["id"])))
    g.add((order_uri, HILO.status, Literal(json_data["status"])))
    g.add((order_uri, HILO.createdAt, Literal(json_data["created_at"], datatype=XSD.dateTime)))

    # Link to organisation (URI, not literal)
    if "customer" in json_data:
        customer_uri = ORG[json_data["customer"].lower().replace(" ", "-")]
        g.add((order_uri, HILO.customer, customer_uri))

    return g

# Usage
data = {"id": "ORD-123", "status": "created", "created_at": "2026-02-27T10:00:00Z", "customer": "Acme Corp"}
graph = json_to_rdf(data)
print(graph.serialize(format="turtle"))
```

Output:
```turtle
@prefix hilo: <http://hilo.semantics.io/ontology/> .
@prefix event: <http://hilo.semantics.io/events/> .

event:order-ORD-123 a hilo:Order ;
    hilo:orderId "ORD-123" ;
    hilo:status "created" ;
    hilo:createdAt "2026-02-27T10:00:00Z"^^xsd:dateTime ;
    hilo:customer <http://hilo.semantics.io/organisations/acme-corp> .
```

## Transforming CSV to RDF

```python
import csv
from io import StringIO
from rdflib import Graph, Literal, Namespace
from rdflib.namespace import RDF, XSD

HILO = Namespace("http://hilo.semantics.io/ontology/")
EVENT = Namespace("http://hilo.semantics.io/events/")

def csv_to_rdf(csv_string: str, mapping: dict) -> Graph:
    """
    Transform CSV rows into RDF triples using a mapping config.
    
    mapping example:
    {
        "subject_prefix": "event:shipment-",
        "subject_field": "shipment_id",
        "type": "hilo:Shipment",
        "fields": {
            "origin": {"predicate": "hilo:origin", "datatype": "string"},
            "destination": {"predicate": "hilo:destination", "datatype": "string"},
            "weight_kg": {"predicate": "hilo:weight", "datatype": "decimal"}
        }
    }
    """
    g = Graph()
    g.bind("hilo", HILO)
    g.bind("event", EVENT)

    reader = csv.DictReader(StringIO(csv_string))
    for row in reader:
        subject = EVENT[f"{mapping['subject_prefix']}{row[mapping['subject_field']]}"]
        g.add((subject, RDF.type, HILO[mapping["type"].split(":")[1]]))

        for field, config in mapping["fields"].items():
            if field in row and row[field]:
                predicate = HILO[config["predicate"].split(":")[1]]
                datatype = XSD[config["datatype"]] if config["datatype"] != "string" else XSD.string
                g.add((subject, predicate, Literal(row[field], datatype=datatype)))

    return g
```

## RDF to JSON (for API responses)

```python
def rdf_to_json(graph: Graph, subject_uri: URIRef) -> dict:
    """Convert triples about a subject into a flat JSON object."""
    result = {"uri": str(subject_uri)}
    
    for predicate, obj in graph.predicate_objects(subject_uri):
        key = predicate.split("/")[-1]  # Use last part of URI as key
        if isinstance(obj, Literal):
            result[key] = obj.toPython()
        else:
            result[key] = str(obj)
    
    return result
```

## SPARQL Query Templates

### Select all resources of a type
```sparql
PREFIX hilo: <http://hilo.semantics.io/ontology/>
PREFIX event: <http://hilo.semantics.io/events/>

SELECT ?order ?status ?createdAt
WHERE {
    ?order a hilo:Order ;
           hilo:status ?status ;
           hilo:createdAt ?createdAt .
}
ORDER BY DESC(?createdAt)
LIMIT 100
```

### Filter by property value
```sparql
PREFIX hilo: <http://hilo.semantics.io/ontology/>

SELECT ?order ?createdAt
WHERE {
    ?order a hilo:Order ;
           hilo:status "created" ;
           hilo:createdAt ?createdAt .
}
```

### Get all properties of a specific resource
```sparql
PREFIX event: <http://hilo.semantics.io/events/>

SELECT ?predicate ?object
WHERE {
    event:order-ORD-123 ?predicate ?object .
}
```

### Insert new triples
```sparql
PREFIX hilo: <http://hilo.semantics.io/ontology/>
PREFIX event: <http://hilo.semantics.io/events/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

INSERT DATA {
    event:order-ORD-456 a hilo:Order ;
        hilo:orderId "ORD-456" ;
        hilo:status "created" ;
        hilo:createdAt "2026-02-27T14:00:00Z"^^xsd:dateTime .
}
```

### Count resources
```sparql
PREFIX hilo: <http://hilo.semantics.io/ontology/>

SELECT (COUNT(?order) AS ?total)
WHERE {
    ?order a hilo:Order .
}
```

### Events since timestamp (for polling)
```sparql
PREFIX hilo: <http://hilo.semantics.io/ontology/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?event ?type ?createdAt
WHERE {
    ?event a hilo:Event ;
           hilo:eventType ?type ;
           hilo:createdAt ?createdAt .
    FILTER (?createdAt > "2026-02-27T00:00:00Z"^^xsd:dateTime)
}
ORDER BY DESC(?createdAt)
```

## SPARQLWrapper Usage

```python
from SPARQLWrapper import SPARQLWrapper, JSON, POST
from config import settings

def query(sparql_string: str) -> dict:
    """Run a SELECT query against GraphDB."""
    sparql = SPARQLWrapper(f"{settings.graphdb_url}/repositories/{settings.graphdb_repository}")
    sparql.setQuery(sparql_string)
    sparql.setReturnFormat(JSON)
    return sparql.query().convert()

def update(sparql_string: str):
    """Run an INSERT/DELETE against GraphDB."""
    sparql = SPARQLWrapper(f"{settings.graphdb_url}/repositories/{settings.graphdb_repository}/statements")
    sparql.setMethod(POST)
    sparql.setQuery(sparql_string)
    sparql.query()
```

## SHACL Shapes

### Order shape (Turtle)

```turtle
@prefix sh:   <http://www.w3.org/ns/shacl#> .
@prefix hilo: <http://hilo.semantics.io/ontology/> .
@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .

hilo:OrderShape a sh:NodeShape ;
    sh:targetClass hilo:Order ;
    sh:property [
        sh:path hilo:orderId ;
        sh:datatype xsd:string ;
        sh:minCount 1 ;
        sh:maxCount 1 ;
        sh:name "Order ID" ;
        sh:message "Order must have exactly one orderId (string)."
    ] ;
    sh:property [
        sh:path hilo:status ;
        sh:datatype xsd:string ;
        sh:minCount 1 ;
        sh:in ("created" "in_transit" "delivered" "cancelled") ;
        sh:name "Status" ;
        sh:message "Status must be one of: created, in_transit, delivered, cancelled."
    ] ;
    sh:property [
        sh:path hilo:createdAt ;
        sh:datatype xsd:dateTime ;
        sh:minCount 1 ;
        sh:maxCount 1 ;
        sh:name "Created At" ;
        sh:message "Order must have exactly one createdAt (dateTime)."
    ] .
```

### Validating with pySHACL

```python
from pyshacl import validate
from rdflib import Graph

def validate_triples(data_graph: Graph, shapes_path: str) -> tuple[bool, str]:
    """Validate a data graph against SHACL shapes. Returns (is_valid, report)."""
    shapes_graph = Graph()
    shapes_graph.parse(shapes_path, format="turtle")

    conforms, results_graph, results_text = validate(
        data_graph,
        shacl_graph=shapes_graph,
        inference="none",
        abort_on_first=False
    )
    return conforms, results_text

# Usage
data = json_to_rdf(some_data)
is_valid, report = validate_triples(data, "graphdb/shapes/order-shape.ttl")
if not is_valid:
    raise ValueError(f"SHACL validation failed:\n{report}")
```

## Mapping Configuration Format

Mappings define how legacy fields translate to RDF predicates. Store as JSON:

```json
{
    "name": "acme-order-mapping",
    "source_format": "json",
    "target_class": "hilo:Order",
    "subject_template": "event:order-{id}",
    "fields": [
        {
            "source_path": "id",
            "predicate": "hilo:orderId",
            "datatype": "xsd:string",
            "required": true
        },
        {
            "source_path": "status",
            "predicate": "hilo:status",
            "datatype": "xsd:string",
            "required": true
        },
        {
            "source_path": "created_at",
            "predicate": "hilo:createdAt",
            "datatype": "xsd:dateTime",
            "required": true
        },
        {
            "source_path": "customer.name",
            "predicate": "hilo:customer",
            "object_type": "uri",
            "uri_template": "org:{value_kebab}",
            "required": false
        }
    ]
}
```

This format allows HILO's AI to generate deterministic mappings that run automatically once defined.

## Patterns to Avoid

- **Never use full URIs when a prefix exists.** `hilo:Order` not `<http://hilo.semantics.io/ontology/Order>`.
- **Never concatenate user input into SPARQL.** Sanitize or parameterize.
- **Never store triples without SHACL validation.** Invalid data is worse than no data.
- **Never forget namespace bindings.** RDFLib requires `g.bind()` for clean serialization.
- **Never use blank nodes for identifiable resources.** Everything that could be referenced later needs a URI.
- **Never assume datatypes.** Always specify `datatype=XSD.string` or `datatype=XSD.dateTime` explicitly. Implicit typing leads to silent mismatches.
