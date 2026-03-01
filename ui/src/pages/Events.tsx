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
  Search,
  X,
  Zap,
} from "lucide-react";
import { fetchEvents, fetchEvent, Event } from "../api/events";
import FilterChips from "../components/FilterChips";

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
        const tokenize = (s: string) => {
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
            {tokenize(line)}
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

function DetailPanel({ event, detail, loadingDetail, onClose, onNavigate }: DetailPanelProps) {
  return (
    <div className="animate-slide-in-right glass rounded-hilo shadow-hilo border border-[var(--border)] flex flex-col h-full overflow-hidden">
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

      <div className="p-4 border-b border-[var(--border)] space-y-2">
        {[
          { label: "ID", value: event.id.slice(0, 8) + "…" },
          { label: "Source", value: event.source_node },
          { label: "Type", value: event.event_type },
          { label: "Created", value: new Date(event.created_at).toLocaleString() },
        ].map(({ label, value }) => (
          <div key={label} className="flex gap-2 text-xs">
            <span className="text-[var(--text-muted)] w-14 flex-shrink-0">{label}</span>
            <span className="text-[var(--text)] font-mono break-all">{value}</span>
          </div>
        ))}
        <StatusBadge status="published" />
      </div>

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

// ─── Popover dropdown ─────────────────────────────────────────────────────────

interface PopoverChipProps {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  formatLabel?: (v: string) => string;
}

function PopoverChip({
  label,
  options,
  selected,
  onToggle,
  onClear,
  formatLabel = (v) => v,
}: PopoverChipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const hasSelected = selected.length > 0;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium transition-all duration-150 ${
          hasSelected
            ? "bg-hilo-purple text-white"
            : "bg-transparent border border-hilo-gray/30 text-hilo-dark/60 dark:text-white/60 hover:border-hilo-purple/50 hover:text-hilo-purple dark:hover:border-hilo-purple-light/50 dark:hover:text-hilo-purple-light"
        }`}
      >
        {hasSelected ? `${label}: ${selected.map(formatLabel).join(", ")}` : label}
        {hasSelected ? (
          <span
            role="button"
            aria-label={`Clear ${label} filter`}
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="ml-0.5 hover:opacity-70"
          >
            <X size={12} />
          </span>
        ) : (
          <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      {open && options.length > 0 && (
        <div className="absolute top-full left-0 mt-1.5 z-50 glass border border-[var(--border)] rounded-hilo shadow-hilo-lg py-1 min-w-[160px] animate-scale-in">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onToggle(opt); }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-hilo-purple-50/60 dark:hover:bg-hilo-purple/10 ${
                selected.includes(opt)
                  ? "text-hilo-purple-dark dark:text-hilo-purple-light font-medium"
                  : "text-[var(--text)]"
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`h-3.5 w-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                    selected.includes(opt)
                      ? "bg-hilo-purple border-hilo-purple"
                      : "border-hilo-gray/50"
                  }`}
                >
                  {selected.includes(opt) && (
                    <svg viewBox="0 0 10 8" fill="none" className="w-2 h-2">
                      <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                {formatLabel(opt)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Expandable search ────────────────────────────────────────────────────────

function SearchChip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function expand() {
    setExpanded(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function collapse() {
    if (!value) setExpanded(false);
  }

  return expanded ? (
    <div className="flex items-center gap-1 border-b border-hilo-gray/30 dark:border-white/20 px-1 pb-0.5">
      <Search size={13} className="text-[var(--text-muted)] flex-shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={collapse}
        placeholder="Search…"
        className="bg-transparent text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none w-28"
      />
      {value && (
        <button
          type="button"
          onClick={() => { onChange(""); setExpanded(false); }}
          aria-label="Clear search"
          className="text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <X size={12} />
        </button>
      )}
    </div>
  ) : (
    <button
      type="button"
      onClick={expand}
      aria-label="Open search"
      className="p-1.5 rounded-full text-[var(--text-muted)] hover:text-hilo-purple dark:hover:text-hilo-purple-light hover:bg-hilo-purple-50/50 dark:hover:bg-hilo-purple/10 transition-colors"
    >
      <Search size={15} />
    </button>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Published", value: "published" },
  { label: "Delivered", value: "delivered" },
  { label: "Failed", value: "failed" },
  { label: "Dead-lettered", value: "dead-lettered" },
];

interface Filters {
  search: string;
  eventTypes: string[];
  sourceNodes: string[];
  statuses: string[];
}

const EMPTY_FILTERS: Filters = {
  search: "",
  eventTypes: [],
  sourceNodes: [],
  statuses: ["all"],
};

function hasActiveFilters(f: Filters): boolean {
  return (
    f.search !== "" ||
    f.eventTypes.length > 0 ||
    f.sourceNodes.length > 0 ||
    !(f.statuses.length === 1 && f.statuses[0] === "all")
  );
}

interface FilterBarProps {
  filters: Filters;
  onChange: (f: Filters) => void;
  eventTypes: string[];
  sourceNodes: string[];
}

function FilterBar({ filters, onChange, eventTypes, sourceNodes }: FilterBarProps) {
  const active = hasActiveFilters(filters);

  // Build the active filter summary chips
  const summaryChips: { key: string; label: string; clear: () => void }[] = [];
  if (filters.search) {
    summaryChips.push({ key: "search", label: `"${filters.search}"`, clear: () => onChange({ ...filters, search: "" }) });
  }
  filters.eventTypes.forEach((t) =>
    summaryChips.push({ key: `type-${t}`, label: toSentenceCase(t), clear: () => onChange({ ...filters, eventTypes: filters.eventTypes.filter((x) => x !== t) }) })
  );
  filters.sourceNodes.forEach((n) =>
    summaryChips.push({ key: `src-${n}`, label: n, clear: () => onChange({ ...filters, sourceNodes: filters.sourceNodes.filter((x) => x !== n) }) })
  );
  if (!(filters.statuses.length === 1 && filters.statuses[0] === "all")) {
    filters.statuses.forEach((s) =>
      summaryChips.push({ key: `status-${s}`, label: s, clear: () => {
        const next = filters.statuses.filter((x) => x !== s);
        onChange({ ...filters, statuses: next.length === 0 ? ["all"] : next });
      }})
    );
  }

  return (
    <div className="space-y-2">
      {/* Main filter row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status chips */}
        <FilterChips
          options={STATUS_OPTIONS}
          selected={filters.statuses}
          onChange={(statuses) => onChange({ ...filters, statuses })}
          multiSelect
          allValue="all"
        />

        <div className="w-px h-5 bg-hilo-gray/20 self-center hidden sm:block" />

        {/* Type popover chip */}
        <PopoverChip
          label="Type ▾"
          options={eventTypes}
          selected={filters.eventTypes}
          onToggle={(v) => {
            const next = filters.eventTypes.includes(v)
              ? filters.eventTypes.filter((x) => x !== v)
              : [...filters.eventTypes, v];
            onChange({ ...filters, eventTypes: next });
          }}
          onClear={() => onChange({ ...filters, eventTypes: [] })}
          formatLabel={toSentenceCase}
        />

        {/* Source popover chip */}
        <PopoverChip
          label="Source ▾"
          options={sourceNodes}
          selected={filters.sourceNodes}
          onToggle={(v) => {
            const next = filters.sourceNodes.includes(v)
              ? filters.sourceNodes.filter((x) => x !== v)
              : [...filters.sourceNodes, v];
            onChange({ ...filters, sourceNodes: next });
          }}
          onClear={() => onChange({ ...filters, sourceNodes: [] })}
        />

        {/* Expandable search */}
        <SearchChip value={filters.search} onChange={(search) => onChange({ ...filters, search })} />
      </div>

      {/* Active filter summary */}
      {active && (
        <div className="flex flex-wrap items-center gap-1.5 animate-fade-in">
          {summaryChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-hilo-purple-50 dark:bg-hilo-purple/15 text-hilo-purple-dark dark:text-hilo-purple-light animate-scale-in"
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.clear}
                aria-label={`Remove ${chip.label} filter`}
                className="hover:opacity-70 transition-opacity"
              >
                <X size={10} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="text-xs text-[var(--text-muted)] hover:text-hilo-purple dark:hover:text-hilo-purple-light transition-colors ml-1"
          >
            Clear all
          </button>
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Event | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const prevIds = useRef<Set<string>>(new Set());
  const newIds = useRef<Set<string>>(new Set());

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

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setLoadingDetail(true);
    fetchEvent(selectedId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoadingDetail(false));
  }, [selectedId]);

  const eventTypes = useMemo(
    () => Array.from(new Set(events.map((e) => e.event_type))).sort(),
    [events]
  );
  const sourceNodes = useMemo(
    () => Array.from(new Set(events.map((e) => e.source_node))).sort(),
    [events]
  );

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (
        filters.search &&
        !e.event_type.includes(filters.search) &&
        !e.source_node.includes(filters.search)
      )
        return false;
      if (filters.eventTypes.length > 0 && !filters.eventTypes.includes(e.event_type))
        return false;
      if (filters.sourceNodes.length > 0 && !filters.sourceNodes.includes(e.source_node))
        return false;
      // Status filter: all events are "published" until backend tracks status
      const activeStatuses = filters.statuses.filter((s) => s !== "all");
      if (activeStatuses.length > 0 && !activeStatuses.includes("published"))
        return false;
      return true;
    });
  }, [events, filters]);

  const active = hasActiveFilters(filters);
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
      />

      {/* Main content: list + optional detail panel */}
      <div className="flex gap-5 items-start transition-all duration-200">
        {/* Event list */}
        <div
          className={`min-w-0 glass rounded-hilo shadow-hilo overflow-hidden transition-all duration-200 ${
            panelOpen ? "flex-none w-full lg:w-[58%]" : "flex-1"
          }`}
        >
          {/* Table header — T4: quiet, no tint */}
          <div className="hidden md:grid grid-cols-[auto_1fr_auto_auto] gap-3 px-4 py-2.5 border-b border-hilo-gray/20 dark:border-white/10">
            {["Status", "Event", "Source", "Time"].map((h) => (
              <span
                key={h}
                className="font-body text-xs text-hilo-dark/40 dark:text-white/30 uppercase tracking-wider"
              >
                {h}
              </span>
            ))}
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
                    onClick={() => setSelectedId(isSelected ? null : ev.id)}
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

          {/* Footer — T5: filter context */}
          {!loading && (filtered.length > 0 || events.length > 0) && (
            <div className="px-4 py-2.5 border-t border-[var(--border)] flex items-center justify-between">
              <span className="text-xs text-hilo-dark/40 dark:text-white/30">
                {active
                  ? `${filtered.length} of ${events.length} event${events.length !== 1 ? "s" : ""} · filtered`
                  : `${events.length} event${events.length !== 1 ? "s" : ""}`}
              </span>
              {active && (
                <button
                  type="button"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                  className="text-xs text-[var(--text-muted)] hover:text-hilo-purple dark:hover:text-hilo-purple-light transition-colors"
                >
                  Clear filters
                </button>
              )}
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
          <div
            className="lg:hidden fixed inset-0 z-30 bg-black/30"
            aria-hidden="true"
            onClick={() => setSelectedId(null)}
          />
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
