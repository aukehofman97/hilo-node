const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

export interface Event {
  id: string;
  source_node: string;
  event_type: string;
  created_at: string;
  triples?: string[];
}

export async function fetchEvents(limit = 5): Promise<Event[]> {
  const resp = await fetch(`${API_URL}/events?limit=${limit}`, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) {
    throw new Error(`fetchEvents failed (${resp.status})`);
  }
  return resp.json();
}
