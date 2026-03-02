import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  Key,
  Loader2,
  Network,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldX,
  X,
} from "lucide-react";
import {
  acceptConnection,
  fetchPeerIdentity,
  getToken,
  listConnections,
  recordOutgoingRequest,
  rejectConnection,
  resendAcceptance,
  sendConnectionRequest,
} from "../api/connections";
import { Connection, NodeIdentity, TokenResponse } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function secondsUntil(iso: string): number {
  return Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
}

function formatCountdown(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Token card with countdown ────────────────────────────────────────────────

function TokenCard({ peerNodeId }: { peerNodeId: string }) {
  const [tokenData, setTokenData] = useState<TokenResponse | null>(null);
  const [secs, setSecs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [keyExpanded, setKeyExpanded] = useState(false);
  const refreshing = useRef(false);

  const load = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const t = await getToken(peerNodeId);
      setTokenData(t);
      setSecs(secondsUntil(t.expires_at));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      refreshing.current = false;
    }
  }, [peerNodeId]);

  // Initial load
  useEffect(() => {
    load();
  }, [load]);

  // Countdown tick + auto-refresh at 30s remaining
  useEffect(() => {
    if (!tokenData) return;
    const id = setInterval(() => {
      setSecs((prev) => {
        if (prev <= 1) {
          load();
          return 0;
        }
        if (prev === 30) {
          load();
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [tokenData, load]);

  const copy = () => {
    if (!tokenData) return;
    navigator.clipboard.writeText(tokenData.token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const urgency = secs < 30 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400";

  if (loading) {
    return (
      <div className="mt-3 rounded-hilo bg-[var(--surface-2)] border border-[var(--border)] p-3 flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <Loader2 size={14} className="animate-spin" />
        Generating token…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-3 rounded-hilo bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40 p-3 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
        <AlertCircle size={14} />
        {error}
        <button onClick={load} className="ml-auto text-xs underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-hilo bg-[var(--surface-2)] border border-[var(--border)] p-3 space-y-2">
      {/* Token row */}
      <div className="flex items-center gap-2">
        <Key size={13} className="text-[var(--text-muted)] flex-shrink-0" />
        <code className="flex-1 text-[11px] font-mono text-[var(--text-muted)] truncate select-all">
          Bearer {tokenData!.token.slice(0, 32)}…
        </code>
        <button
          onClick={copy}
          title="Copy bearer token"
          className="flex-shrink-0 p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-hilo-purple/8 transition-all"
        >
          {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
        </button>
        <button
          onClick={load}
          title="Refresh token"
          className="flex-shrink-0 p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-hilo-purple/8 transition-all"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Countdown */}
      <div className="flex items-center gap-1.5 text-xs">
        <Clock size={11} className={urgency} />
        <span className={`font-mono font-semibold ${urgency}`}>{formatCountdown(secs)}</span>
        <span className="text-[var(--text-muted)]">remaining — auto-refreshes at 0:30</span>
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  pending_incoming: "Pending — incoming",
  pending_outgoing: "Pending — outgoing",
  accept_pending: "Accept pending",
  rejected: "Rejected",
  suspended: "Suspended",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 border-green-200/60 dark:border-green-800/40",
  pending_incoming: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200/60 dark:border-amber-800/40",
  pending_outgoing: "bg-hilo-purple-50 dark:bg-hilo-purple/15 text-hilo-purple-dark dark:text-hilo-purple-light border-hilo-purple/20",
  accept_pending: "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border-orange-200/60 dark:border-orange-800/40",
  rejected: "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-200/60 dark:border-red-800/40",
  suspended: "bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/10",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[status] ?? STATUS_STYLES.suspended}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ─── Connection card ──────────────────────────────────────────────────────────

interface ConnectionCardProps {
  conn: Connection;
  onAccept?: (id: string) => Promise<void>;
  onReject?: (id: string) => Promise<void>;
  onResend?: (id: string) => Promise<void>;
}

function ConnectionCard({ conn, onAccept, onReject, onResend }: ConnectionCardProps) {
  const [acting, setAct] = useState<string | null>(null);
  const [keyExpanded, setKeyExpanded] = useState(false);

  const handle = async (action: string, fn: () => Promise<void>) => {
    setAct(action);
    try { await fn(); } finally { setAct(null); }
  };

  return (
    <div className="card-base p-5 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-semibold text-[var(--text)] text-sm">{conn.peer_name}</span>
            <code className="text-xs text-[var(--text-muted)] bg-[var(--surface-2)] px-1.5 py-0.5 rounded border border-[var(--border)]">
              {conn.peer_node_id}
            </code>
            <StatusBadge status={conn.status} />
          </div>
          <a
            href={conn.peer_base_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-hilo-purple transition-colors"
          >
            {conn.peer_base_url}
            <ExternalLink size={10} />
          </a>
        </div>
        <span className="text-xs text-[var(--text-muted)] flex-shrink-0">{relativeTime(conn.created_at)}</span>
      </div>

      {/* Action buttons */}
      {conn.status === "pending_incoming" && onAccept && onReject && (
        <div className="flex gap-2">
          <button
            onClick={() => handle("accept", () => onAccept(conn.id))}
            disabled={acting !== null}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-hilo text-xs font-semibold bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-60"
          >
            {acting === "accept" ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
            Accept
          </button>
          <button
            onClick={() => handle("reject", () => onReject(conn.id))}
            disabled={acting !== null}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-hilo text-xs font-semibold bg-[var(--surface-2)] hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200/60 dark:border-red-800/40 transition-colors disabled:opacity-60"
          >
            {acting === "reject" ? <Loader2 size={13} className="animate-spin" /> : <ShieldX size={13} />}
            Reject
          </button>
        </div>
      )}

      {conn.status === "accept_pending" && onResend && (
        <button
          onClick={() => handle("resend", () => onResend(conn.id))}
          disabled={acting !== null}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-hilo text-xs font-semibold bg-orange-50 dark:bg-orange-950/30 hover:bg-orange-100 dark:hover:bg-orange-950/50 text-orange-700 dark:text-orange-400 border border-orange-200/60 dark:border-orange-800/40 transition-colors disabled:opacity-60"
        >
          {acting === "resend" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          Resend acceptance
        </button>
      )}

      {/* Active: token + key */}
      {conn.status === "active" && (
        <>
          <TokenCard peerNodeId={conn.peer_node_id} />

          {/* Public key toggle */}
          <button
            onClick={() => setKeyExpanded((e) => !e)}
            className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            <Key size={12} />
            Peer public key
            <ChevronDown size={12} className={`transition-transform ${keyExpanded ? "rotate-180" : ""}`} />
          </button>
          {keyExpanded && (
            <pre className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--surface-2)] border border-[var(--border)] rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
              {conn.peer_public_key ?? "Key not yet fetched"}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

// ─── Preview card ─────────────────────────────────────────────────────────────

function IdentityPreview({ identity }: { identity: NodeIdentity }) {
  const [keyExpanded, setKeyExpanded] = useState(false);
  return (
    <div className="mt-3 rounded-hilo bg-hilo-purple-50/50 dark:bg-hilo-purple/8 border border-hilo-purple/20 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Shield size={14} className="text-hilo-purple-dark dark:text-hilo-purple-light" />
        <span className="text-sm font-semibold text-[var(--text)]">{identity.name}</span>
        <code className="text-xs text-[var(--text-muted)] bg-[var(--surface-2)] px-1.5 py-0.5 rounded border border-[var(--border)]">
          {identity.node_id}
        </code>
      </div>
      <p className="text-xs text-[var(--text-muted)]">{identity.base_url}</p>
      <button
        onClick={() => setKeyExpanded((e) => !e)}
        className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
      >
        <Key size={11} />
        Public key
        <ChevronDown size={11} className={`transition-transform ${keyExpanded ? "rotate-180" : ""}`} />
      </button>
      {keyExpanded && (
        <pre className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--surface-2)] border border-[var(--border)] rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
          {identity.public_key}
        </pre>
      )}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title, count }: { icon: React.ReactNode; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[var(--text-muted)]">{icon}</span>
      <h2 className="font-display font-semibold text-[var(--text)] text-sm">{title}</h2>
      {count !== undefined && (
        <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-muted)]">
          {count}
        </span>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Connections() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // URL input + preview state
  const [peerUrl, setPeerUrl] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewIdentity, setPreviewIdentity] = useState<NodeIdentity | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);

  const load = useCallback(async () => {
    try {
      const conns = await listConnections();
      setConnections(conns);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [load]);

  // ── Preview ──

  const handlePreview = async () => {
    if (!peerUrl.trim()) return;
    setPreviewing(true);
    setPreviewError(null);
    setPreviewIdentity(null);
    setSendError(null);
    setSendSuccess(false);
    try {
      const identity = await fetchPeerIdentity(peerUrl.trim());
      setPreviewIdentity(identity);
    } catch (e: any) {
      setPreviewError(e.message);
    } finally {
      setPreviewing(false);
    }
  };

  const handleSend = async () => {
    if (!previewIdentity) return;
    setSending(true);
    setSendError(null);
    try {
      // Step 1: Send request to peer
      await sendConnectionRequest(peerUrl.trim());
      // Step 2: Record outgoing on our own API so the acceptance callback finds a match
      await recordOutgoingRequest(previewIdentity);
      setSendSuccess(true);
      setPeerUrl("");
      setPreviewIdentity(null);
      await load();
    } catch (e: any) {
      setSendError(e.message);
    } finally {
      setSending(false);
    }
  };

  // ── Connection actions ──

  const handleAccept = async (id: string) => {
    await acceptConnection(id);
    await load();
  };

  const handleReject = async (id: string) => {
    await rejectConnection(id);
    await load();
  };

  const handleResend = async (id: string) => {
    await resendAcceptance(id);
    await load();
  };

  // ── Buckets ──

  const active = connections.filter((c) => c.status === "active");
  const pendingIn = connections.filter((c) => c.status === "pending_incoming");
  const pendingOut = connections.filter((c) => c.status === "pending_outgoing");
  const acceptPending = connections.filter((c) => c.status === "accept_pending");

  return (
    <div className="animate-fade-in space-y-8">
      {/* Page header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-[var(--text)]">Connections</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Manage peer nodes — exchange public keys, accept requests, and retrieve authenticated data.
        </p>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-hilo bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40 text-sm text-red-600 dark:text-red-400">
          <AlertCircle size={15} />
          {loadError}
        </div>
      )}

      {/* ── Connect to a peer ── */}
      <div className="card-base p-6 space-y-4">
        <SectionHeader icon={<Search size={15} />} title="Connect to a peer" />
        <p className="text-sm text-[var(--text-muted)] -mt-2">
          Enter a peer node's base URL to preview its identity and send a connection request.
        </p>

        <div className="flex gap-2">
          <input
            type="url"
            value={peerUrl}
            onChange={(e) => {
              setPeerUrl(e.target.value);
              setPreviewIdentity(null);
              setPreviewError(null);
              setSendSuccess(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && handlePreview()}
            placeholder="https://node-b.example.com"
            className="flex-1 px-3 py-2 rounded-hilo text-sm bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-hilo-purple/40 focus:border-hilo-purple/60 transition-all"
          />
          <button
            onClick={handlePreview}
            disabled={!peerUrl.trim() || previewing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-hilo text-sm font-semibold bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] hover:bg-hilo-purple/8 disabled:opacity-50 transition-all"
          >
            {previewing ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Preview
          </button>
        </div>

        {previewError && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle size={14} />
            {previewError}
          </div>
        )}

        {previewIdentity && (
          <>
            <IdentityPreview identity={previewIdentity} />
            {sendError && (
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle size={14} />
                {sendError}
              </div>
            )}
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex items-center gap-2 px-4 py-2 rounded-hilo text-sm font-semibold bg-hilo-purple hover:bg-hilo-purple-dark text-white transition-colors disabled:opacity-60"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Send connection request to {previewIdentity.name}
            </button>
          </>
        )}

        {sendSuccess && (
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle size={14} />
            Request sent — waiting for the peer to accept.
          </div>
        )}
      </div>

      {/* ── Pending incoming ── */}
      {pendingIn.length > 0 && (
        <div>
          <SectionHeader icon={<Network size={15} />} title="Pending — incoming" count={pendingIn.length} />
          <div className="space-y-3">
            {pendingIn.map((c) => (
              <ConnectionCard key={c.id} conn={c} onAccept={handleAccept} onReject={handleReject} />
            ))}
          </div>
        </div>
      )}

      {/* ── Accept pending (callback failed) ── */}
      {acceptPending.length > 0 && (
        <div>
          <SectionHeader icon={<AlertCircle size={15} />} title="Accept pending" count={acceptPending.length} />
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Acceptance was sent but the callback to the peer failed. Use "Resend acceptance" to retry.
          </p>
          <div className="space-y-3">
            {acceptPending.map((c) => (
              <ConnectionCard key={c.id} conn={c} onResend={handleResend} />
            ))}
          </div>
        </div>
      )}

      {/* ── Pending outgoing ── */}
      {pendingOut.length > 0 && (
        <div>
          <SectionHeader icon={<Clock size={15} />} title="Pending — outgoing" count={pendingOut.length} />
          <p className="text-xs text-[var(--text-muted)] mb-3">Waiting for the peer to accept your request.</p>
          <div className="space-y-3">
            {pendingOut.map((c) => (
              <ConnectionCard key={c.id} conn={c} />
            ))}
          </div>
        </div>
      )}

      {/* ── Active peers ── */}
      <div>
        <SectionHeader icon={<CheckCircle size={15} />} title="Active peers" count={active.length} />
        {active.length === 0 ? (
          <div className="card-base p-8 text-center space-y-2">
            <Shield size={32} className="mx-auto text-[var(--text-muted)] opacity-40" />
            <p className="text-sm text-[var(--text-muted)]">No active peers yet.</p>
            <p className="text-xs text-[var(--text-muted)]">Connect to a peer above and accept their request to start exchanging data.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {active.map((c) => (
              <ConnectionCard key={c.id} conn={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
