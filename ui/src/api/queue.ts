const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

export interface QueueStats {
  messages_ready: number | null;
  consumers: number | null;
  dead_letters: number | null;
}

export async function fetchQueueStats(): Promise<QueueStats> {
  const resp = await fetch(`${API_URL}/queue/stats`, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) {
    // Endpoint not yet built — return null values
    return { messages_ready: null, consumers: null, dead_letters: null };
  }
  return resp.json();
}
