export interface HealthStatus {
  graphdb: string;
  queue: string;
  status: "healthy" | "degraded";
}

export interface Event {
  id: string;
  source_node: string;
  event_type: string;
  subject?: string;
  triples: string;
  created_at: string;
  links: Record<string, string>;
}

export interface Triple {
  subject: string;
  predicate: string;
  object: string;
}

export type ConnectionStatus =
  | "pending_outgoing"
  | "pending_incoming"
  | "active"
  | "accept_pending"
  | "rejected"
  | "suspended";

export interface Connection {
  id: string;
  peer_node_id: string;
  peer_name: string;
  peer_base_url: string;
  peer_public_key: string | null;
  status: ConnectionStatus;
  initiated_by: "us" | "them";
  created_at: string;
  updated_at: string;
}

export interface NodeIdentity {
  node_id: string;
  name: string;
  base_url: string;
  public_key: string;
  version: string;
}

export interface TokenResponse {
  token: string;
  expires_at: string;
  peer_url: string;
}
