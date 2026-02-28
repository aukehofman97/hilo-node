import React, { useEffect, useState, useCallback, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { ArrowRight, ExternalLink, AlertCircle } from "lucide-react";
import { runSparqlQuery, SparqlBinding } from "../api/data";
import { fetchHealth } from "../api/health";
import { fetchEvents, Event } from "../api/events";
import { fetchQueueStats, QueueStats } from "../api/queue";
import { useTheme } from "../context/ThemeContext";

// ─── useCountUp ──────────────────────────────────────────────────────────────

function useCountUp(target: number | null, duration = 800): number | null {
  const [current, setCurrent] = useState<number | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (target === null) {
      setCurrent(null);
      return;
    }
    const start = current ?? 0;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // cubic ease-out
      setCurrent(Math.round(start + (target - start) * ease));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return current;
}

// ─── GraphPreview ─────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
}
interface GraphLink {
  source: string;
  target: string;
  label: string;
}
interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

function GraphPreview({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { theme } = useTheme();
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [tripleCount, setTripleCount] = useState<number | null>(null);
  const [entityCount, setEntityCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGraph, setShowGraph] = useState(true);
  const [hovered, setHovered] = useState<GraphNode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphWidth, setGraphWidth] = useState(400);
  const [graphHeight, setGraphHeight] = useState(340);

  const tripleCountUp = useCountUp(tripleCount, 800);
  const entityCountUp = useCountUp(entityCount, 800);

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const w = containerRef.current.offsetWidth;
        setGraphWidth(Math.round(w * 0.6));
        setGraphHeight(Math.round(w * 0.38));
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [spo, countRes, entityRes] = await Promise.all([
        runSparqlQuery("SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 30"),
        runSparqlQuery("SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }"),
        runSparqlQuery(
          "SELECT (COUNT(DISTINCT ?s) AS ?n) WHERE { ?s a ?type }"
        ),
      ]);

      // Build graph
      const nodeMap = new Map<string, GraphNode>();
      const links: GraphLink[] = [];
      spo.results.bindings.forEach((b: SparqlBinding) => {
        const s = b.s?.value ?? "";
        const p = b.p?.value ?? "";
        const o = b.o?.value ?? "";
        const sLabel = s.includes("/") ? s.split("/").pop()! : s;
        const oLabel = o.includes("/") ? o.split("/").pop()! : o;
        if (!nodeMap.has(s)) nodeMap.set(s, { id: s, label: sLabel });
        if (b.o?.type !== "literal" && !nodeMap.has(o)) {
          nodeMap.set(o, { id: o, label: oLabel });
        }
        if (b.o?.type !== "literal") {
          links.push({ source: s, target: o, label: p.split("/").pop() ?? p });
        }
      });

      setGraphData({ nodes: Array.from(nodeMap.values()), links });
      setTripleCount(
        parseInt(countRes.results.bindings[0]?.n?.value ?? "0", 10)
      );
      setEntityCount(
        parseInt(entityRes.results.bindings[0]?.n?.value ?? "0", 10)
      );
    } catch {
      setError("Could not load graph data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isDark = theme === "dark";
  const nodeColor = isDark ? "#B594E0" : "#9063CD";
  const linkColor = isDark ? "rgba(182,148,224,0.35)" : "rgba(144,99,205,0.25)";
  const bgColor = "transparent";

  return (
    <div className="glass rounded-hilo shadow-hilo overflow-hidden" ref={containerRef}>
      <div className="flex flex-col md:flex-row">
        {/* Graph area */}
        <div className="flex-1 min-h-[280px] md:min-h-[340px] relative bg-[var(--surface-alt)] border-b md:border-b-0 md:border-r border-[var(--border)]">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="space-y-3 w-48">
                <div className="h-3 bg-[var(--border)] rounded animate-pulse" />
                <div className="h-3 bg-[var(--border)] rounded animate-pulse w-3/4" />
                <div className="h-3 bg-[var(--border)] rounded animate-pulse w-1/2" />
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
              <AlertCircle size={22} className="text-red-400" />
              <p className="text-sm">{error}</p>
              <button
                onClick={load}
                className="text-xs px-3 py-1.5 rounded-full bg-hilo-purple-50 dark:bg-hilo-purple/15 text-hilo-purple-dark dark:text-hilo-purple-light"
              >
                Retry
              </button>
            </div>
          )}
          {!loading && !error && graphData && (
            <>
              {/* Mobile toggle */}
              <button
                className="md:hidden absolute top-2 right-2 z-10 text-xs px-2.5 py-1 rounded-full bg-hilo-purple-50 dark:bg-hilo-purple/15 text-hilo-purple-dark dark:text-hilo-purple-light"
                onClick={() => setShowGraph((v) => !v)}
              >
                {showGraph ? "Hide graph" : "Show graph"}
              </button>
              {(showGraph || window.innerWidth >= 768) && (
                <ForceGraph2D
                  width={graphWidth}
                  height={graphHeight}
                  graphData={graphData}
                  backgroundColor={bgColor}
                  nodeColor={() => nodeColor}
                  nodeLabel={(n) => (n as GraphNode).label}
                  linkColor={() => linkColor}
                  linkDirectionalArrowLength={4}
                  linkDirectionalArrowRelPos={1}
                  cooldownTicks={80}
                  onNodeClick={(n) => onNavigate("data-explorer")}
                  onNodeHover={(n) => setHovered(n as GraphNode | null)}
                />
              )}
              {hovered && (
                <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-[var(--surface)] shadow border border-[var(--border)] text-xs text-[var(--text)]">
                  {hovered.label}
                </div>
              )}
            </>
          )}
          {!loading && !error && !graphData?.nodes.length && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
              <p className="text-sm">No graph data yet</p>
              <p className="text-xs">POST events to populate the graph</p>
            </div>
          )}
        </div>

        {/* Metrics sidebar */}
        <div className="w-full md:w-56 p-5 flex flex-col gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-muted)] mb-0.5">
              Knowledge Graph
            </p>
            <h2 className="font-display font-extrabold text-lg text-[var(--text)] leading-tight">
              Graph Preview
            </h2>
          </div>

          <div className="flex flex-row md:flex-col gap-3">
            <div className="flex-1 glass rounded-hilo p-3 border border-[var(--border)]">
              <p className="text-xs text-[var(--text-muted)] mb-0.5">Triples</p>
              {loading ? (
                <div className="h-7 w-16 bg-[var(--border)] rounded animate-pulse" />
              ) : (
                <p className="font-display font-bold text-2xl text-[var(--text)]">
                  {tripleCountUp ?? "—"}
                </p>
              )}
            </div>
            <div className="flex-1 glass rounded-hilo p-3 border border-[var(--border)]">
              <p className="text-xs text-[var(--text-muted)] mb-0.5">Entity types</p>
              {loading ? (
                <div className="h-7 w-10 bg-[var(--border)] rounded animate-pulse" />
              ) : (
                <p className="font-display font-bold text-2xl text-[var(--text)]">
                  {entityCountUp ?? "—"}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={() => onNavigate("data-explorer")}
            className="mt-auto flex items-center gap-1.5 text-sm text-hilo-purple-dark dark:text-hilo-purple-light font-medium hover:underline"
          >
            Open Data Explorer
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── HealthStrip ──────────────────────────────────────────────────────────────

function HealthStrip({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [health, setHealth] = useState<{
    status: string;
    graphdb: string;
    queue: string;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await fetchHealth();
        if (alive) setHealth(data);
      } catch {
        if (alive) setHealth(null);
      }
    };
    load();
    const id = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const allOk = health?.status === "healthy";
  const dot = (status: string) => {
    const ok = status === "ok";
    return (
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          ok ? "bg-green-500" : "bg-amber-400 animate-pulse"
        }`}
      />
    );
  };

  return (
    <button
      onClick={() => onNavigate("dashboard")}
      className="w-full glass rounded-hilo shadow-hilo px-5 py-3 flex flex-wrap items-center justify-between gap-3 transition-colors duration-300 hover:bg-hilo-purple-50/30 dark:hover:bg-white/4 text-left"
    >
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${
            allOk ? "bg-green-500" : "bg-amber-400 animate-pulse"
          }`}
        />
        <span className="text-sm font-medium text-[var(--text)]">
          {health === null
            ? "Checking…"
            : allOk
            ? "All systems go"
            : "Degraded"}
        </span>
      </div>
      {health && (
        <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
          <span className="flex items-center gap-1.5">
            {dot("ok")} API
          </span>
          <span className="flex items-center gap-1.5">
            {dot(health.graphdb)} GraphDB
          </span>
          <span className="flex items-center gap-1.5">
            {dot(health.queue)} Queue
          </span>
        </div>
      )}
    </button>
  );
}

// ─── RecentEvents ─────────────────────────────────────────────────────────────

function toSentenceCase(s: string) {
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function EventSkeleton() {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[var(--border)] animate-pulse">
      <div className="h-5 w-16 rounded-full bg-[var(--border)]" />
      <div className="flex-1 h-4 rounded bg-[var(--border)]" />
      <div className="h-4 w-10 rounded bg-[var(--border)]" />
    </div>
  );
}

function RecentEvents({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevIds = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const data = await fetchEvents(5);
      setEvents(data);
      setError(null);
    } catch {
      setError("Could not load events");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, [load]);

  const isNew = (id: string) => !prevIds.current.has(id);
  useEffect(() => {
    const newSet = new Set(events.map((e) => e.id));
    prevIds.current = newSet;
  }, [events]);

  return (
    <div className="glass rounded-hilo shadow-hilo p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-[var(--text)] text-base">
          Recent Events
        </h2>
        <button
          onClick={load}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          Refresh
        </button>
      </div>

      {loading && (
        <div className="flex-1">
          <EventSkeleton />
          <EventSkeleton />
          <EventSkeleton />
        </div>
      )}
      {error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
          <AlertCircle size={18} className="text-red-400" />
          <p className="text-sm">{error}</p>
          <button
            onClick={load}
            className="text-xs px-3 py-1 rounded-full bg-hilo-purple-50 dark:bg-hilo-purple/15 text-hilo-purple-dark dark:text-hilo-purple-light"
          >
            Retry
          </button>
        </div>
      )}
      {!loading && !error && events.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)]">
          <p className="text-sm">No events yet</p>
          <p className="text-xs mt-1">POST to /events to get started</p>
        </div>
      )}
      {!loading && !error && events.length > 0 && (
        <div className="flex-1 divide-y divide-[var(--border)]">
          {events.map((ev) => (
            <div
              key={ev.id}
              className={`flex items-center gap-3 py-2.5 ${
                isNew(ev.id) ? "animate-slide-in-top" : ""
              }`}
            >
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 whitespace-nowrap">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
                received
              </span>
              <span className="flex-1 text-sm text-[var(--text)] truncate">
                {toSentenceCase(ev.event_type)}
              </span>
              <span
                className="text-xs text-[var(--text-muted)] whitespace-nowrap"
                title={ev.created_at}
              >
                {relativeTime(ev.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => onNavigate("events")}
        className="mt-4 flex items-center gap-1.5 text-sm text-hilo-purple-dark dark:text-hilo-purple-light font-medium hover:underline"
      >
        View all events <ArrowRight size={14} />
      </button>
    </div>
  );
}

// ─── QueuePulse ───────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  tooltip,
}: {
  label: string;
  value: number | null;
  tooltip?: string;
}) {
  const animated = useCountUp(value, 800);
  return (
    <div className="glass rounded-hilo p-3 border border-[var(--border)] text-center">
      <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
      {value === null ? (
        <span
          title={tooltip}
          className="font-display font-bold text-xl text-[var(--text-muted)] cursor-help"
        >
          —
        </span>
      ) : (
        <p className="font-display font-bold text-xl text-[var(--text)]">
          {animated ?? value}
        </p>
      )}
    </div>
  );
}

function QueuePulse({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="glass rounded-hilo shadow-hilo p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-[var(--text)] text-base">
          Queue Pulse
        </h2>
      </div>

      {loading && (
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="glass rounded-hilo p-3 border border-[var(--border)] animate-pulse"
            >
              <div className="h-3 w-full bg-[var(--border)] rounded mb-2" />
              <div className="h-6 w-3/4 mx-auto bg-[var(--border)] rounded" />
            </div>
          ))}
        </div>
      )}
      {error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
          <AlertCircle size={18} className="text-red-400" />
          <p className="text-sm">{error}</p>
          <button
            onClick={load}
            className="text-xs px-3 py-1 rounded-full bg-hilo-purple-50 dark:bg-hilo-purple/15 text-hilo-purple-dark dark:text-hilo-purple-light"
          >
            Retry
          </button>
        </div>
      )}
      {!loading && !error && stats && (
        <div className="grid grid-cols-3 gap-2">
          <KpiCard
            label="Pending"
            value={stats.messages_ready}
            tooltip="Stats available after queue stats endpoint is built"
          />
          <KpiCard
            label="Dead letters"
            value={stats.dead_letters}
            tooltip="Stats available after queue stats endpoint is built"
          />
          <KpiCard
            label="Consumers"
            value={stats.consumers}
            tooltip="Stats available after queue stats endpoint is built"
          />
        </div>
      )}

      <button
        onClick={() => onNavigate("queue")}
        className="mt-auto pt-4 flex items-center gap-1.5 text-sm text-hilo-purple-dark dark:text-hilo-purple-light font-medium hover:underline"
      >
        View queue <ArrowRight size={14} />
      </button>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

interface DashboardProps {
  onNavigate: (page: string) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  return (
    <div className="animate-fade-in space-y-6">
      <GraphPreview onNavigate={onNavigate} />
      <HealthStrip onNavigate={onNavigate} />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <RecentEvents onNavigate={onNavigate} />
        </div>
        <div className="lg:col-span-2">
          <QueuePulse onNavigate={onNavigate} />
        </div>
      </div>
    </div>
  );
}
