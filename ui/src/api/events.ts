const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

export interface Event {
  id: string;
  source_node: string;
  event_type: string;
  created_at: string;
  triples?: string;
  links?: Record<string, string>;
}

export interface FetchEventsParams {
  limit?: number;
  since?: string;
  event_type?: string;
}

export async function fetchEvents(params: FetchEventsParams | number = {}): Promise<Event[]> {
  // Accept plain number for backwards compat with Dashboard (fetchEvents(5))
  const p: FetchEventsParams = typeof params === "number" ? { limit: params } : params;
  const qs = new URLSearchParams();
  if (p.limit) qs.set("limit", String(p.limit));
  if (p.since) qs.set("since", p.since);
  if (p.event_type) qs.set("event_type", p.event_type);
  const resp = await fetch(`${API_URL}/events?${qs}`, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`fetchEvents failed (${resp.status})`);
  return resp.json();
}

export async function fetchEvent(id: string): Promise<Event> {
  const resp = await fetch(`${API_URL}/events/${id}`, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`fetchEvent failed (${resp.status})`);
  return resp.json();
}
