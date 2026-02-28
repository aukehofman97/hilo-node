const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

export interface Consumer {
  id: string;
  status: "active" | "idle" | "disconnected";
  connected_at: string | null;
  messages_processed: number;
}

export interface QueueStats {
  messages_ready: number | null;
  messages_unacked: number | null;
  consumers: number | null;
  dead_letters: number | null;
  throughput_per_minute: number | null;
  consumer_details: Consumer[];
}

export async function fetchQueueStats(): Promise<QueueStats> {
  const resp = await fetch(`${API_URL}/queue/stats`, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) {
    return {
      messages_ready: null,
      messages_unacked: null,
      consumers: null,
      dead_letters: null,
      throughput_per_minute: null,
      consumer_details: [],
    };
  }
  return resp.json();
}

// TODO: implement POST /queue/retry/{message_id} on the backend (Phase 7)
export async function retryDeadLetter(messageId: string): Promise<void> {
  const resp = await fetch(`${API_URL}/queue/retry/${messageId}`, {
    method: "POST",
  });
  if (!resp.ok) throw new Error(`Retry failed (${resp.status})`);
}
