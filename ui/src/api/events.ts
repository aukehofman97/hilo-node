const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

export interface Event {
  id: string;
  source_node: string;
  event_type: string;
  created_at: string;
  triples?: string;
  links?: Record<string, string>;
  has_local_copy?: boolean;
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
  const internalKey = process.env.REACT_APP_INTERNAL_KEY || "dev";
  const resp = await fetch(`${API_URL}/events/${id}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${internalKey}` },
  });
  if (!resp.ok) throw new Error(`fetchEvent failed (${resp.status})`);
  return resp.json();
}

/** Import fetched RDF triples into the local triple store via POST /events/{id}/import. */
export async function importEvent(id: string, triples: string): Promise<{ status: string; id: string }> {
  const internalKey = process.env.REACT_APP_INTERNAL_KEY || "dev";
  const resp = await fetch(`${API_URL}/events/${id}/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${internalKey}`,
    },
    body: JSON.stringify({ triples }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: `Import failed (${resp.status})` }));
    throw new Error(err.detail || `Import failed (${resp.status})`);
  }
  return resp.json();
}

/** Fetch the full event from a remote node using a bearer token. */
export async function fetchRemoteEvent(dataUrl: string, token: string): Promise<Event> {
  const resp = await fetch(dataUrl, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  if (resp.status === 401) throw new Error("Token rejected — request a fresh token from the Connections page");
  if (!resp.ok) throw new Error(`Remote fetch failed (${resp.status})`);
  return resp.json();
}
