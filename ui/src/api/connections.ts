import { Connection, NodeIdentity, TokenResponse } from "../types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ── Identity ──────────────────────────────────────────────────────────────────

/** Fetch this node's own identity from /.well-known/hilo-node. */
export async function fetchOwnIdentity(): Promise<NodeIdentity> {
  const resp = await fetch(`${API_URL}/.well-known/hilo-node`, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`Could not fetch own identity (${resp.status})`);
  return resp.json();
}

/** Fetch a peer's identity from their /.well-known/hilo-node endpoint. */
export async function fetchPeerIdentity(peerBaseUrl: string): Promise<NodeIdentity> {
  const url = `${peerBaseUrl.replace(/\/$/, "")}/.well-known/hilo-node`;
  const resp = await fetch(url, { headers: { Accept: "application/json" } });
  if (!resp.ok) throw new Error(`Could not reach node at ${peerBaseUrl} (${resp.status})`);
  const data = await resp.json();
  if (!data.node_id) throw new Error("Response is not a HILO node identity");
  return data;
}

// ── Connections ───────────────────────────────────────────────────────────────

export async function listConnections(): Promise<Connection[]> {
  const resp = await fetch(`${API_URL}/connections`, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`listConnections failed (${resp.status})`);
  return resp.json();
}

/**
 * Send a connection request to a peer node.
 * Fetches our own identity first, then POSTs it to the peer's /connections/request.
 * This is called directly from the browser to the peer (peer has CORS open).
 */
export async function sendConnectionRequest(peerBaseUrl: string): Promise<Connection> {
  const ours = await fetchOwnIdentity();
  const url = `${peerBaseUrl.replace(/\/$/, "")}/connections/request`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      node_id: ours.node_id,
      name: ours.name,
      base_url: ours.base_url,
      public_key: ours.public_key,
    }),
  });
  if (resp.status === 409) throw new Error("Connection request already exists");
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${resp.status})`);
  }
  return resp.json();
}

/**
 * Record a connection request WE sent to a peer on our own API (pending_outgoing).
 * Called after a successful sendConnectionRequest so this node can track the outgoing
 * state and the peer's acceptance callback finds a matching record.
 */
export async function recordOutgoingRequest(peer: NodeIdentity): Promise<Connection> {
  const resp = await fetch(`${API_URL}/connections/outgoing`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      peer_node_id: peer.node_id,
      peer_name: peer.name,
      peer_base_url: peer.base_url,
    }),
  });
  if (resp.status === 409) throw new Error("Connection already exists for this peer");
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.detail || `Record outgoing failed (${resp.status})`);
  }
  return resp.json();
}

export async function acceptConnection(connectionId: string): Promise<Connection> {
  const resp = await fetch(`${API_URL}/connections/${connectionId}/accept`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.detail || `Accept failed (${resp.status})`);
  }
  return resp.json();
}

export async function rejectConnection(connectionId: string): Promise<void> {
  const resp = await fetch(`${API_URL}/connections/${connectionId}/reject`, {
    method: "POST",
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.detail || `Reject failed (${resp.status})`);
  }
}

export async function resendAcceptance(connectionId: string): Promise<Connection> {
  const resp = await fetch(`${API_URL}/connections/${connectionId}/resend`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.detail || `Resend failed (${resp.status})`);
  }
  return resp.json();
}

// ── Token ─────────────────────────────────────────────────────────────────────

export async function getToken(peerNodeId: string): Promise<TokenResponse> {
  const resp = await fetch(`${API_URL}/connections/${peerNodeId}/token`, {
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`getToken failed (${resp.status})`);
  return resp.json();
}
