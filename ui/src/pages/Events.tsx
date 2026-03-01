import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  Filter,
  X,
  Zap,
} from "lucide-react";
import { fetchEvents, fetchEvent, Event } from "../api/events";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function toSentenceCase(s: string) {
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

const URI_PREFIXES: Record<string, string> = {
  "http://hilo.semantics.io/ontology/": "hilo:",
  "http://hilo.semantics.io/events/": "event:",
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#": "rdf:",
  "http://www.w3.org/2001/XMLSchema#": "xsd:",
  "http://www.w3.org/2000/01/rdf-schema#": "rdfs:",
  "http://schema.org/": "schema:",
  "http://example.org/": "ex:",
};

function shortenUri(uri: string): string {
  for (const [ns, prefix] of Object.entries(URI_PREFIXES)) {
    if (uri.startsWith(ns)) return prefix + uri.slice(ns.length);
  }
  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    const parts = uri.split(/[/#]/);
    return parts[parts.length - 1] || uri;
  }
  return uri;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

type EventStatus = "published" | "delivered" | "failed" | "dead-lettered";

const STATUS_STYLES: Record<EventStatus, string> = {
  published:
    "bg-hilo-purple-50 dark:bg-hilo-purple/15 text-hilo-purple-dark dark:text-hilo-purple-light",
  delivered: "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400",
  failed: "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400",
  "dead-lettered": "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400",
};

const STATUS_DOT: Record<EventStatus, string> = {
  published: "bg-hilo-purple",
  delivered: "bg-green-500",
  failed: "bg-red-500",
  "dead-lettered": "bg-amber-400",
};

function StatusBadge({ status }: { status: EventStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_STYLES[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full inline-block ${STATUS_DOT[status]}`} />
      {status}
    </span>
  );
}

// ─── Turtle display ───────────────────────────────────────────────────────────

function TurtleView({ raw }: { raw: string }) {
  if (!raw.trim()) {
    return (
      <p className="text-xs text-[var(--text-muted)] italic">
        Triples not available for this event (stored before payload persistence was added).
      </p>
    );
  }

  const lines = raw.split(/\\n|\n/).filter(Boolean);
  return (
    <div className="rounded-hilo bg-[var(--surface-alt)] border border-[var(--border)] p-3 font-mono text-xs overflow-auto max-h-56 space-y-0.5">
      {lines.map((line, i) => {
        // Colorize: URIs in <…> are teal, literals in quotes are amber, prefixes are purple
        const parts: React.ReactNode[] = [];
        let rest = line;

        const tokenize = (s: string) => {
          // URI ref: <...>
          const uriRe = /<([^>]+)>/g;
          let last = 0;
          let match;
          const nodes: React.ReactNode[] = [];
          while ((match = uriRe.exec(s)) !== null) {
            if (match.index > last) nodes.push(s.slice(last, match.index));
            nodes.push(
              <span key={match.index} className="text-hilo-purple-dark dark:text-hilo-purple-light">
                &lt;{shortenUri(match[1])}&gt;
              </span>
            );
            last = uriRe.lastIndex;
          }
          if (last < s.length) nodes.push(s.slice(last));
          return nodes;
        };

        return (
          <div key={i} className="text-[var(--text)]">
            {tokenize(rest)}
          </div>
        );
      })}
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

interface DetailPanelProps {
  event: Event;
  detail: Event | null;
  loadingDetail: boolean;
  onClose: () => void;
  onNavigate: (page: string) => void;
}

function DetailPanel({
  event,
  detail,
  loadingDetail,
  onClose,
  onNavigate,
}: DetailPanelProps) {
  return (
    <div className="animate-slide-in-right glass rounded-hilo shadow-hilo border border-[var(--border)] flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-[var(--border)]">
        <div>
          <p className="text-xs text-[var(--text-muted)] mb-0.5">Event detail</p>
          <h3 className="font-display font-semibold text-sm text-[var(--text)]">
            {toSentenceCase(event.event_type)}
          </h3>
        </div>
        <button
          onClick={onClose}
          aria-label="Close detail panel"
          className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Metadata */}
      <div className="p-4 border-b border-[var(--border)] space-y-2">
        {[
          { label: "ID", value: event.id.slice(0, 8) + "…" },
          { label: "Source", value: event.source_node },
          { label: "Type", value: event.event_type },
          {
            label: "Created",
            value: new Date(event.created_at).toLocaleString(),
          },
        ].map(({ label, value }) => (
          <div key={label} className="flex gap-2 text-xs">
            <span className="text-[var(--text-muted)] w-14 flex-shrink-0">{label}</span>
            <span className="text-[var(--text)] font-mono break-all">{value}</span>
          </div>
        ))}
        <StatusBadge status="published" />
      </div>

      {/* Triples */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-muted)]">
          RDF Payload
        </p>
        {loadingDetail ? (
          <div className="space-y-1.5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-3 rounded bg-[var(--border)] animate-pulse"
                style={{ width: `${60 + i * 10}%` }}
              />
            ))}
          </div>
        ) : (
          <TurtleView raw={detail?.triples ?? ""} />
        )}

        {/* Links */}
        {detail?.links && Object.keys(detail.links).length > 1 && (
          <div className="space-y-1 pt-2">
            <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-muted)]">
              Links
            </p>
            {Object.entries(detail.links).map(([rel, href]) => (
              <div key={rel} className="flex gap-2 text-xs">
                <span className="text-[var(--text-muted)]">{rel}</span>
                <span className="text-hilo-purple-dark dark:text-hilo-purple-light font-mono truncate">
                  {String(href)}
                </span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => onNavigate("data-explorer")}
          className="flex items-center gap-1.5 text-xs text-hilo-purple-dark dark:text-hilo-purple-light font-medium hover:underline pt-1"
        >
          Explore in Data Explorer <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

interface Filters {
  search: string;
  eventType: string;
  sourceNode: string;
  status: string;
}

const EMPTY_FILTERS: Filters = {
  search: "",
  eventType: "",
  sourceNode: "",
  status: "",
};

interface FilterBarProps {
  filters: Filters;
  onChange: (f: Filters) => void;
  eventTypes: string[];
  sourceNodes: string[];
  mobileOpen: boolean;
  onToggleMobile: () => void;
}

function FilterBar({
  filters,
  onChange,
  eventTypes,
  sourceNodes,
  mobileOpen,
  onToggleMobile,
}: FilterBarProps) {
  const active = Object.entries(filters).filter(([, v]) => v !== "");

  return (
    <div className="space-y-2">
      {/* Mobile toggle */}
      <button
        className="md:hidden flex items-center gap-2 px-3 py-2 rounded-full glass border border-[var(--border)] text-sm text-[var(--text-muted)]"
        onClick={onToggleMobile}
      >
        <Filter size={14} />
        Filters
        {active.length > 0 && (
          <span className="ml-1 h-4 w-4 rounded-full bg-hilo-purple text-white text-[10px] flex items-center justify-center font-bold">
            {active.length}
          </span>
        )}
        <ChevronDown
          size={12}
          className={`transition-transform ${mobileOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Filter row */}
      <div className={`${mobileOpen ? "flex" : "hidden"} md:flex flex-wrap gap-2`}>
        {/* Search */}
        <input
          type="text"
          placeholder="Search events…"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="glass border border-[var(--border)] rounded-full px-3 py-1.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-hilo-purple/50 w-40"
        />

        {/* Event type */}
        <select
          value={filters.eventType}
          onChange={(e) => onChange({ ...filters, eventType: e.target.value })}
          className="glass border border-[var(--border)] rounded-full px-3 py-1.5 text-sm text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-hilo-purple/50 bg-transparent"
        >
          <option value="">All types</option>
          {eventTypes.map((t) => (
            <option key={t} value={t}>
              {toSentenceCase(t)}
            </option>
          ))}
        </select>

        {/* Source node */}
        <select
          value={filters.sourceNode}
          onChange={(e) => onChange({ ...filters, sourceNode: e.target.value })}
          className="glass border border-[var(--border)] rounded-full px-3 py-1.5 text-sm text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-hilo-purple/50 bg-transparent"
        >
          <option value="">All sources</option>
          {sourceNodes.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        {/* Status */}
        <select
          value={filters.status}
          onChange={(e) => onChange({ ...filters, status: e.target.value })}
          className="glass border border-[var(--border)] rounded-full px-3 py-1.5 text-sm text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-hilo-purple/50 bg-transparent"
        >
          <option value="">All statuses</option>
          <option value="published">Published</option>
          <option value="delivered">Delivered</option>
          <option value="failed">Failed</option>
          <option value="dead-lettered">Dead-lettered</option>
        </select>

        {/* Clear */}
        {active.length > 0 && (
          <button
            onClick={() => onChange(EMPTY_FILTERS)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-colors animate-scale-in"
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* Active filter pills */}
      {active.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {active.map(([key, val]) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-hilo-purple-50 dark:bg-hilo-purple/15 text-hilo-purple-dark dark:text-hilo-purple-light animate-scale-in"
            >
              {key}: {val}
              <button
                onClick={() => onChange({ ...filters, [key]: "" })}
                aria-label={`Remove ${key} filter`}
                className="hover:text-red-500 transition-colors"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Row skeleton ─────────────────────────────────────────────────────────────

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] animate-pulse">
      <div className="h-5 w-20 rounded-full bg-[var(--border)]" />
      <div className="flex-1 h-4 rounded bg-[var(--border)]" />
      <div className="h-4 w-14 rounded bg-[var(--border)]" />
      <div className="h-4 w-12 rounded bg-[var(--border)]" />
    </div>
  );
}

// ─── Events page ──────────────────────────────────────────────────────────────

interface EventsProps {
  onNavigate: (page: string) => void;
}

export default function Events({ onNavigate }: EventsProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Event | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const prevIds = useRef<Set<string>>(new Set());
  const newIds = useRef<Set<string>>(new Set());

  // Load event list
  const load = useCallback(async () => {
    try {
      const data = await fetchEvents({ limit: 100 });
      const incoming = new Set(data.map((e) => e.id));
      const fresh = new Set(Array.from(incoming).filter((id) => !prevIds.current.has(id)));
      newIds.current = fresh;
      prevIds.current = incoming;
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

  // Load detail when row is selected
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    fetchEvent(selectedId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoadingDetail(false));
  }, [selectedId]);

  // Derived: unique types + sources for filter dropdowns
  const eventTypes = useMemo(
    () => Array.from(new Set(events.map((e) => e.event_type))).sort(),
    [events]
  );
  const sourceNodes = useMemo(
    () => Array.from(new Set(events.map((e) => e.source_node))).sort(),
    [events]
  );

  // Apply client-side filters
  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (filters.search && !e.event_type.includes(filters.search) && !e.source_node.includes(filters.search))
        return false;
      if (filters.eventType && e.event_type !== filters.eventType) return false;
      if (filters.sourceNode && e.source_node !== filters.sourceNode) return false;
      // status is always "published" for now (no backend status tracking yet)
      if (filters.status && filters.status !== "published") return false;
      return true;
    });
  }, [events, filters]);

  const selectedEvent = events.find((e) => e.id === selectedId) ?? null;
  const panelOpen = !!selectedId;

  return (
    <div className="animate-fade-in space-y-5">
      {/* Header */}
      <div>
        <h1 className="font-display font-extrabold text-[var(--text)] text-2xl mb-1">
          Events Monitor
        </h1>
        <p className="text-[var(--text-muted)] text-sm">
          Real-time data sharing activity · auto-refreshes every 10 s
        </p>
      </div>

      {/* Filter bar */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        eventTypes={eventTypes}
        sourceNodes={sourceNodes}
        mobileOpen={mobileFiltersOpen}
        onToggleMobile={() => setMobileFiltersOpen((v) => !v)}
      />

      {/* Main content: list + optional detail panel */}
      <div className={`flex gap-5 items-start transition-all duration-200`}>
        {/* Event list — always visible; compresses to 58% on lg when panel open */}
        <div
          className={`min-w-0 glass rounded-hilo shadow-hilo overflow-hidden transition-all duration-200 ${
            panelOpen ? "flex-none w-full lg:w-[58%]" : "flex-1"
          }`}
        >
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[auto_1fr_auto_auto] gap-3 px-4 py-2.5 bg-hilo-purple-50/60 dark:bg-hilo-purple/10 border-b border-[var(--border)] text-xs font-medium uppercase tracking-widest text-[var(--text-muted)]">
            <span>Status</span>
            <span>Event</span>
            <span>Source</span>
            <span>Time</span>
          </div>

          {/* Loading */}
          {loading && (
            <div>
              {[1, 2, 3, 4, 5].map((i) => (
                <RowSkeleton key={i} />
              ))}
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="flex flex-col items-center justify-center gap-3 p-12 text-[var(--text-muted)]">
              <AlertCircle size={28} className="text-red-400" />
              <p className="text-sm">{error}</p>
              <button
                onClick={() => { setLoading(true); load(); }}
                className="px-4 py-2 rounded-full bg-hilo-purple-50 dark:bg-hilo-purple/15 text-hilo-purple-dark dark:text-hilo-purple-light text-sm font-medium"
              >
                Retry
              </button>
            </div>
          )}

          {/* Empty */}
          {!loading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 p-12 text-center text-[var(--text-muted)]">
              <Zap size={36} className="text-[var(--text-muted)]/30" />
              {events.length === 0 ? (
                <>
                  <p className="text-sm font-medium text-[var(--text)]">No events yet</p>
                  <p className="text-xs">
                    Events will appear when data is shared through this node.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-[var(--text)]">
                    No events match your filters
                  </p>
                  <button
                    onClick={() => setFilters(EMPTY_FILTERS)}
                    className="text-xs px-3 py-1.5 rounded-full bg-hilo-purple-50 dark:bg-hilo-purple/15 text-hilo-purple-dark dark:text-hilo-purple-light"
                  >
                    Clear filters
                  </button>
                </>
              )}
            </div>
          )}

          {/* Rows */}
          {!loading && !error && filtered.length > 0 && (
            <div className="divide-y divide-[var(--border)]">
              {filtered.map((ev) => {
                const isSelected = selectedId === ev.id;
                const isNew = newIds.current.has(ev.id);
                return (
                  <button
                    key={ev.id}
                    onClick={() =>
                      setSelectedId(isSelected ? null : ev.id)
                    }
                    aria-label={`${toSentenceCase(ev.event_type)} — ${relativeTime(ev.created_at)}`}
                    aria-pressed={isSelected}
                    className={`w-full grid grid-cols-[auto_1fr] md:grid-cols-[auto_1fr_auto_auto] gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors duration-150 ${
                      isSelected
                        ? "bg-hilo-purple-50 dark:bg-hilo-purple/10"
                        : "hover:bg-hilo-purple-50/50 dark:hover:bg-white/5"
                    } ${isNew ? "animate-slide-in-top" : ""}`}
                  >
                    <StatusBadge status="published" />
                    <span className="text-sm text-[var(--text)] truncate">
                      {toSentenceCase(ev.event_type)}
                    </span>
                    <span className="hidden md:block text-xs text-[var(--text-muted)] whitespace-nowrap">
                      {ev.source_node}
                    </span>
                    <span
                      className="text-xs text-[var(--text-muted)] whitespace-nowrap"
                      title={ev.created_at}
                    >
                      {relativeTime(ev.created_at)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Footer */}
          {!loading && filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t border-[var(--border)] text-xs text-[var(--text-muted)]">
              {filtered.length} event{filtered.length !== 1 ? "s" : ""}
              {events.length !== filtered.length && ` (${events.length} total)`}
            </div>
          )}
        </div>

        {/* Desktop side panel (lg+) */}
        {panelOpen && selectedEvent && (
          <div className="hidden lg:block flex-none w-[42%]">
            <DetailPanel
              event={selectedEvent}
              detail={detail}
              loadingDetail={loadingDetail}
              onClose={() => setSelectedId(null)}
              onNavigate={onNavigate}
            />
          </div>
        )}
      </div>

      {/* Tablet / mobile: bottom sheet + backdrop */}
      {panelOpen && selectedEvent && (
        <>
          {/* Backdrop — tap to close */}
          <div
            className="lg:hidden fixed inset-0 z-30 bg-black/30"
            aria-hidden="true"
            onClick={() => setSelectedId(null)}
          />
          {/* Bottom sheet: full-screen on mobile, 65vh on tablet */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Event detail: ${toSentenceCase(selectedEvent.event_type)}`}
            className="lg:hidden fixed inset-x-0 bottom-0 z-40 h-full md:h-[65vh] overflow-y-auto rounded-t-hilo shadow-hilo-lg border-t border-[var(--border)] bg-[var(--surface)] animate-slide-up"
          >
            <DetailPanel
              event={selectedEvent}
              detail={detail}
              loadingDetail={loadingDetail}
              onClose={() => setSelectedId(null)}
              onNavigate={onNavigate}
            />
          </div>
        </>
      )}
    </div>
  );
}
