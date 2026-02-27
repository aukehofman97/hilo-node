export interface HealthStatus {
  graphdb: string;
  queue: string;
  status: "healthy" | "degraded";
}

export interface Event {
  id: string;
  source_node: string;
  event_type: string;
  triples: string;
  created_at: string;
  links: Record<string, string>;
}

export interface Triple {
  subject: string;
  predicate: string;
  object: string;
}
