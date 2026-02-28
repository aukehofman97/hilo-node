import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { fetchQueueStats, retryDeadLetter, Consumer, QueueStats } from "../api/queue";

// ─── useCountUp ───────────────────────────────────────────────────────────────

function useCountUp(target: number | null, duration = 600): number | null {
  const [current, setCurrent] = useState<number | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (target === null) { setCurrent(null); return; }
    const start = current ?? 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setCurrent(Math.round(start + (target - start) * ease));
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return current;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return "unknown";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

const NULL_TOOLTIP = "Stats available after the queue stats endpoint is reachable";

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: number | null;
  unit?: string;
  accent?: "green" | "amber" | "red";
}) {
  const animated = useCountUp(value, 600);
  const accentClass =
    accent === "green"
      ? "text-green-600 dark:text-green-400"
      : accent === "amber"
      ? "text-amber-600 dark:text-amber-400"
      : accent === "red"
      ? "text-red-600 dark:text-red-400"
      : "text-[var(--text)]";

  return (
    <div className="glass rounded-hilo p-5 border border-[var(--border)] flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-muted)]">
        {label}
      </p>
      {value === null ? (
        <span
          title={NULL_TOOLTIP}
          className="font-display font-bold text-3xl text-[var(--text-muted)] cursor-help"
        >
          —
        </span>
      ) : (
        <p className={`font-display font-bold text-3xl ${accentClass}`}>
          {animated ?? value}
          {unit && (
            <span className="text-sm font-normal text-[var(--text-muted)] ml-1">
              {unit}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

// ─── HealthStrip (compact, problem state) ────────────────────────────────────

function CompactHealthStrip({ stats }: { stats: QueueStats }) {
  const deadLetters = stats.dead_letters ?? 0;
  return (
    <div className="glass rounded-hilo px-5 py-3 flex flex-wrap items-center gap-4 text-sm border border-amber-300/40 dark:border-amber-700/40 bg-amber-50/40 dark:bg-amber-950/10 transition-all duration-400">
      <span className="text-[var(--text-muted)]">
        Pending:{" "}
        <strong className="text-[var(--text)]">{stats.messages_ready ?? "—"}</strong>
      </span>
      <span className="text-[var(--text-muted)]">
        Throughput:{" "}
        <strong className="text-[var(--text)]">
          {stats.throughput_per_minute != null
            ? `${stats.throughput_per_minute}/min`
            : "—"}
        </strong>
      </span>
      <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-semibold">
        <AlertCircle size={14} className="animate-pulse" />
        Dead letters: {deadLetters}
      </span>
      <span className="text-[var(--text-muted)]">
        Consumers: <strong className="text-[var(--text)]">{stats.consumers ?? "—"}</strong>
      </span>
    </div>
  );
}

// ─── Consumer status ──────────────────────────────────────────────────────────

const CONSUMER_DOT: Record<Consumer["status"], string> = {
  active: "bg-green-500",
  idle: "bg-gray-400",
  disconnected: "bg-red-500",
};
const CONSUMER_LABEL: Record<Consumer["status"], string> = {
  active: "active",
  idle: "idle",
  disconnected: "disconnected",
};

function ConsumerList({ consumers }: { consumers: Consumer[] }) {
  if (consumers.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)] py-4 text-center">
        No consumers connected. Check your queue configuration.
      </p>
    );
  }
  return (
    <div className="divide-y divide-[var(--border)]">
      {consumers.map((c) => (
        <div
          key={c.id}
          className="flex items-center gap-3 py-3 text-sm"
        >
          <span
            className={`h-2 w-2 rounded-full flex-shrink-0 ${CONSUMER_DOT[c.status]}`}
          />
          <span className="flex-1 font-mono text-[var(--text)] truncate text-xs">
            {c.id}
          </span>
          <span
            className={`text-xs font-medium ${
              c.status === "active"
                ? "text-green-600 dark:text-green-400"
                : c.status === "disconnected"
                ? "text-red-600 dark:text-red-400"
                : "text-[var(--text-muted)]"
            }`}
          >
            {CONSUMER_LABEL[c.status]}
          </span>
          {c.connected_at && (
            <span className="text-xs text-[var(--text-muted)] hidden sm:block">
              {relativeTime(c.connected_at)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Dead-letter section (TODO: backend endpoint) ────────────────────────────

interface MockDeadLetter {
  message_id: string;
  event_type: string;
  failed_at: string;
  error_reason: string;
  retry_count: number;
}

type RetryState = "idle" | "loading" | "success" | "error";

function DeadLetterSection({
  count,
  problemState,
}: {
  count: number;
  problemState: boolean;
}) {
  // TODO: replace mock data with GET /queue/dead-letters once endpoint is built
  const [mockItems] = useState<MockDeadLetter[]>(
    count > 0
      ? Array.from({ length: Math.min(count, 3) }, (_, i) => ({
          message_id: `mock-${i + 1}`,
          event_type: ["order.created", "shipment.update", "transport.event"][i % 3],
          failed_at: new Date(Date.now() - (i + 1) * 600_000).toISOString(),
          error_reason:
            i === 0
              ? "GraphDB connection timeout"
              : i === 1
              ? "SHACL validation failed — missing required field"
              : "Queue publish retry limit exceeded",
          retry_count: i + 1,
        }))
      : []
  );

  const [retryStates, setRetryStates] = useState<Record<string, RetryState>>({});
  const [items, setItems] = useState(mockItems);
  const [retryAllConfirm, setRetryAllConfirm] = useState(false);
  const [expandedPayload, setExpandedPayload] = useState<string | null>(null);

  const handleRetry = async (id: string) => {
    setRetryStates((s) => ({ ...s, [id]: "loading" }));
    try {
      await retryDeadLetter(id);
      setRetryStates((s) => ({ ...s, [id]: "success" }));
      setTimeout(() => {
        setItems((prev) => prev.filter((m) => m.message_id !== id));
        setRetryStates((s) => { const n = { ...s }; delete n[id]; return n; });
      }, 600);
    } catch {
      setRetryStates((s) => ({ ...s, [id]: "error" }));
      setTimeout(
        () => setRetryStates((s) => ({ ...s, [id]: "idle" })),
        2000
      );
    }
  };

  const handleRetryAll = async () => {
    for (const item of items) await handleRetry(item.message_id);
    setRetryAllConfirm(false);
  };

  if (count === 0) {
    return (
      <div
        className={`glass rounded-hilo border border-[var(--border)] px-5 py-4 flex items-center gap-2 transition-all duration-400`}
      >
        <CheckCircle size={16} className="text-green-500" />
        <span className="text-sm text-[var(--text-muted)]">No failed messages</span>
      </div>
    );
  }

  return (
    <div className="glass rounded-hilo shadow-hilo border border-amber-300/40 dark:border-amber-700/40 overflow-hidden transition-all duration-400">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <AlertCircle size={16} className="text-amber-500" />
          <h2 className="font-display font-semibold text-[var(--text)]">
            Dead Letters
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400">
              {count}
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-[var(--text-muted)] italic">
            {/* TODO: replace mock data with GET /queue/dead-letters endpoint */}
            Showing mock data — API endpoint pending
          </p>
          {items.length > 1 && !retryAllConfirm && (
            <button
              onClick={() => setRetryAllConfirm(true)}
              className="px-3 py-1.5 rounded-full text-sm font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/60 transition-colors"
            >
              Retry All ({items.length})
            </button>
          )}
          {retryAllConfirm && (
            <div className="flex items-center gap-2 animate-scale-in">
              <span className="text-xs text-[var(--text-muted)]">
                Retry {items.length} failed messages?
              </span>
              <button
                onClick={handleRetryAll}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-hilo-purple text-white hover:bg-hilo-purple-dark transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setRetryAllConfirm(false)}
                className="px-3 py-1.5 rounded-full text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="divide-y divide-[var(--border)]">
        {items.map((msg) => {
          const state = retryStates[msg.message_id] ?? "idle";
          return (
            <div
              key={msg.message_id}
              className={`px-5 py-4 transition-all duration-300 ${
                state === "success" ? "animate-fade-out opacity-0" : ""
              } ${state === "error" ? "animate-shake" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-[var(--text-muted)]">
                      {msg.message_id}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-[var(--border)] text-[var(--text-muted)]">
                      {msg.event_type}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {relativeTime(msg.failed_at)}
                    </span>
                    {msg.retry_count > 0 && (
                      <span className="text-xs text-[var(--text-muted)]">
                        {msg.retry_count} retries
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                    {msg.error_reason}
                  </p>
                  {expandedPayload === msg.message_id && (
                    <div className="mt-2 rounded-hilo bg-[var(--surface-alt)] border border-[var(--border)] p-3 font-mono text-xs text-[var(--text-muted)] animate-scale-in">
                      Payload not available — GET /queue/dead-letters endpoint pending
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() =>
                      setExpandedPayload(
                        expandedPayload === msg.message_id ? null : msg.message_id
                      )
                    }
                    className="px-3 py-1.5 rounded-full text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-colors"
                  >
                    {expandedPayload === msg.message_id ? "Hide" : "View payload"}
                  </button>
                  <button
                    onClick={() => handleRetry(msg.message_id)}
                    disabled={state === "loading"}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                      state === "loading"
                        ? "bg-hilo-purple/50 text-white cursor-not-allowed"
                        : state === "success"
                        ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400"
                        : state === "error"
                        ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400"
                        : "bg-hilo-purple text-white hover:bg-hilo-purple-dark"
                    }`}
                  >
                    {state === "loading" ? (
                      <RotateCcw size={12} className="animate-spin" />
                    ) : state === "success" ? (
                      <CheckCircle size={12} />
                    ) : (
                      <RotateCcw size={12} />
                    )}
                    {state === "loading"
                      ? "Retrying…"
                      : state === "success"
                      ? "Done"
                      : state === "error"
                      ? "Failed"
                      : "Retry"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Queue page ───────────────────────────────────────────────────────────────

export default function Queue() {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [consumersExpanded, setConsumersExpanded] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchQueueStats();
      setStats(data);
      setError(null);
    } catch {
      setError("Could not load queue stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [load]);

  const deadLetters = stats?.dead_letters ?? 0;
  const problemState = deadLetters > 0;

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display font-extrabold text-[var(--text)] text-2xl mb-1">
            Queue Inspector
          </h1>
          <p className="text-[var(--text-muted)] text-sm">
            Message queue health and dead-letter management · auto-refreshes every 10 s
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); load(); }}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-hilo-purple-50 hover:bg-hilo-purple-100 dark:bg-hilo-purple/15 dark:hover:bg-hilo-purple/25 text-hilo-purple-dark dark:text-hilo-purple-light text-sm font-medium transition-all duration-200"
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {!loading && error && (
        <div className="glass rounded-hilo p-6 flex items-center justify-between border-l-4 border-l-red-400">
          <div>
            <p className="font-semibold text-red-600 dark:text-red-400 mb-0.5">
              API unreachable
            </p>
            <p className="text-[var(--text-muted)] text-sm">{error}</p>
          </div>
          <button
            onClick={() => { setLoading(true); load(); }}
            className="px-4 py-2 rounded-full bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 text-sm font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="glass rounded-hilo p-5 border border-[var(--border)] animate-pulse"
              >
                <div className="h-3 w-20 rounded bg-[var(--border)] mb-3" />
                <div className="h-8 w-14 rounded bg-[var(--border)]" />
              </div>
            ))}
          </div>
          <div className="glass rounded-hilo p-6 animate-pulse border border-[var(--border)]">
            <div className="h-4 w-24 rounded bg-[var(--border)]" />
          </div>
        </div>
      )}

      {/* Main content */}
      {!loading && stats && (
        <div className="space-y-4 transition-all duration-400">
          {/* Health section — expanded (healthy) or compact strip (problem) */}
          {!problemState ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 transition-all duration-400">
              <KpiCard
                label="Pending"
                value={stats.messages_ready}
                accent={
                  (stats.messages_ready ?? 0) > 20
                    ? "amber"
                    : "green"
                }
              />
              <KpiCard
                label="Throughput"
                value={stats.throughput_per_minute}
                unit="/min"
              />
              <KpiCard
                label="Dead letters"
                value={stats.dead_letters}
                accent="green"
              />
              <KpiCard
                label="Consumers"
                value={stats.consumers}
                accent={(stats.consumers ?? 0) > 0 ? "green" : "amber"}
              />
            </div>
          ) : (
            <CompactHealthStrip stats={stats} />
          )}

          {/* Dead-letter section */}
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-muted)] px-1">
              Dead Letters
            </p>
            <DeadLetterSection
              count={deadLetters}
              problemState={problemState}
            />
          </div>

          {/* Consumer status */}
          <div className="glass rounded-hilo shadow-hilo overflow-hidden border border-[var(--border)] transition-all duration-400">
            <button
              onClick={() => setConsumersExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-hilo-purple-50/30 dark:hover:bg-white/4 transition-colors"
            >
              <div>
                <h2 className="font-display font-semibold text-[var(--text)] text-base">
                  Consumers
                </h2>
                {!consumersExpanded && stats.consumer_details.length > 0 && (
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {stats.consumer_details.length} consumer
                    {stats.consumer_details.length !== 1 ? "s" : ""} ·{" "}
                    {stats.consumer_details.filter((c) => c.status === "active").length} active ·{" "}
                    {stats.consumer_details.filter((c) => c.status === "idle").length} idle
                  </p>
                )}
                {!consumersExpanded && stats.consumer_details.length === 0 && (
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    No consumers connected
                  </p>
                )}
              </div>
              {consumersExpanded ? (
                <ChevronUp size={16} className="text-[var(--text-muted)]" />
              ) : (
                <ChevronDown size={16} className="text-[var(--text-muted)]" />
              )}
            </button>
            {consumersExpanded && (
              <div className="px-5 pb-4 border-t border-[var(--border)] animate-fade-in">
                <ConsumerList consumers={stats.consumer_details} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty / no stats */}
      {!loading && !error && !stats && (
        <div className="glass rounded-hilo p-16 flex flex-col items-center justify-center text-center gap-3">
          <MessageSquare size={36} className="text-[var(--text-muted)]/30" />
          <p className="font-display font-semibold text-[var(--text)]">No queue data</p>
          <p className="text-sm text-[var(--text-muted)]">
            Queue stats unavailable — check your RabbitMQ configuration.
          </p>
        </div>
      )}
    </div>
  );
}
