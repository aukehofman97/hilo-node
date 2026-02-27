# Node UI Context — HILO Node

Specific requirements for the HILO Node UI. This extends the generic frontend skill with context about what the Node UI needs to display. For brand styling, see `brand-reference.md` and `tailwind-theme.md` in this references folder.

## Purpose

The Node UI is a monitoring and visualization dashboard for a single HILO Node. It shows what data is in the GraphDB, what events are flowing through the queue, and the health status of all components.

## Key Views

### Graph Data Explorer
- Query the GraphDB via the API's `GET /data` endpoint (SPARQL)
- Display RDF triples in a readable table format
- Support linked data navigation: clicking a URI loads its properties
- Render `@type` as human-readable labels where possible
- Show provenance/source information for each triple

### Event Monitor
- List recent events from `GET /events` with live polling or auto-refresh
- Show event status: published, delivered, failed, dead-lettered
- Click an event to see its full payload (RDF triples and links)
- Filter by event type, source node, time range

### Node Health Dashboard
- Poll `GET /health` and display status per component: GraphDB, Queue, API
- Green/red indicators per service
- Show queue depth (messages waiting) from the queue stats
- Show GraphDB triple count

### Queue Inspector
- Show current queue state: messages pending, messages in dead-letter queue
- Allow manual retry of dead-lettered messages (re-publish to main queue)
- Show consumer status: connected, consuming, idle

## Data Fetching

All data comes from the HILO Node API (`http://localhost:8000` in development). Never call GraphDB or RabbitMQ directly from the frontend.

```typescript
// Example: fetch events
const response = await fetch(`${API_URL}/events?since=${since}`);
const events: Event[] = await response.json();
```

Use environment variable `REACT_APP_API_URL` for the API base URL.

## TypeScript Interfaces

```typescript
interface Event {
  id: string;
  source_node: string;
  event_type: string;
  created_at: string;
  links: string[];
}

interface HealthStatus {
  graphdb: 'ok' | 'error';
  queue: 'ok' | 'error';
  status: 'healthy' | 'degraded' | 'down';
}

interface Triple {
  subject: string;
  predicate: string;
  object: string;
}
```

## Semantic Data Display

HILO works with RDF / linked data. When rendering triples:

- Shorten URIs using common prefixes (e.g. `http://example.org/` → `ex:`)
- Make URIs clickable — navigating to a subject shows all its properties
- Distinguish between literal values and URI references visually
- Support JSON-LD rendering alongside Turtle syntax
- Handle nested structures gracefully (linked data can be deeply nested)
