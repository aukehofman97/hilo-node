import React, { useState, useCallback, useRef } from "react";
import {
  Database,
  Play,
  RotateCcw,
  ChevronDown,
  ExternalLink,
  AlertCircle,
  FileSearch,
  Sparkles,
  ChevronRight,
  Copy,
  Loader2,
} from "lucide-react";
import { runSparqlQuery, askNaturalLanguage, SparqlResults, AskResponse } from "../api/data";

// ─── URI prefix shortening ────────────────────────────────────────────────────

const PREFIXES: [string, string][] = [
  ["hilo:", "https://hilo-semantics.com/ontology/"],
  ["ecmr:", "https://hilo-semantics.com/ecmr/"],
  ["xsd:", "http://www.w3.org/2001/XMLSchema#"],
  ["rdf:", "http://www.w3.org/1999/02/22-rdf-syntax-ns#"],
  ["rdfs:", "http://www.w3.org/2000/01/rdf-schema#"],
  ["owl:", "http://www.w3.org/2002/07/owl#"],
];

function shortenUri(uri: string): string {
  for (const [prefix, ns] of PREFIXES) {
    if (uri.startsWith(ns)) return prefix + uri.slice(ns.length);
  }
  const hashIdx = uri.lastIndexOf("#");
  const slashIdx = uri.lastIndexOf("/");
  const sep = Math.max(hashIdx, slashIdx);
  if (sep > 0 && sep < uri.length - 1) return "\u2026" + uri.slice(sep);
  return uri;
}

// ─── Preset queries ────────────────────────────────────────────────────────────

interface Preset {
  label: string;
  description: string;
  sparql: string;
}

const PRESETS: Preset[] = [
  {
    label: "All triples",
    description: "Browse every triple in the graph",
    sparql: `SELECT ?subject ?predicate ?object
WHERE { ?subject ?predicate ?object }
LIMIT 50`,
  },
  {
    label: "eCMR documents",
    description: "All electronic consignment notes",
    sparql: `PREFIX hilo: <https://hilo-semantics.com/ontology/>
PREFIX ecmr: <https://hilo-semantics.com/ecmr/>

SELECT ?doc ?id ?status
WHERE {
  ?doc a hilo:EletronicConsignmentNote ;
       hilo:ecmrId ?id ;
       hilo:status  ?status .
}`,
  },
  {
    label: "Orders",
    description: "hilo:Order instances with their status",
    sparql: `PREFIX hilo: <https://hilo-semantics.com/ontology/>

SELECT ?order ?id ?status ?createdAt
WHERE {
  ?order a hilo:Order ;
         hilo:orderId ?id ;
         hilo:status  ?status .
  OPTIONAL { ?order hilo:createdAt ?createdAt }
}
ORDER BY DESC(?createdAt)`,
  },
  {
    label: "HILO events",
    description: "Events stored via the API",
    sparql: `PREFIX hilo: <https://hilo-semantics.com/ontology/>

SELECT ?event ?type ?ts ?payload
WHERE {
  ?event a hilo:Event ;
         hilo:eventType ?type ;
         hilo:timestamp  ?ts .
  OPTIONAL { ?event hilo:payload ?payload }
}
ORDER BY DESC(?ts)
LIMIT 25`,
  },
];

// ─── Sub-components ────────────────────────────────────────────────────────────

interface CellValueProps {
  value: string;
  type: "uri" | "literal" | "bnode";
  onUriClick: (uri: string) => void;
}

function CellValue({ value, type, onUriClick }: CellValueProps) {
  if (type === "uri") {
    const short = shortenUri(value);
    return (
      <button
        onClick={() => onUriClick(value)}
        title={value}
        className="group inline-flex items-center gap-1 px-2 py-0.5 rounded-md
          bg-hilo-purple/10 text-hilo-purple hover:bg-hilo-purple/20
          text-xs font-mono transition-colors"
      >
        <span className="truncate max-w-[240px]">{short}</span>
        <ExternalLink
          size={10}
          className="shrink-0 opacity-0 group-hover:opacity-70 transition-opacity"
        />
      </button>
    );
  }
  if (type === "bnode") {
    return (
      <span className="text-[var(--text-muted)] font-mono text-xs italic">
        _:{value}
      </span>
    );
  }
  return (
    <span
      className="text-[var(--text)] text-xs font-mono break-all"
      title={value}
    >
      {value.length > 120 ? value.slice(0, 120) + "\u2026" : value}
    </span>
  );
}

interface SkeletonTableProps {
  cols: number;
}

function SkeletonTable({ cols }: SkeletonTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-hilo-purple-50 dark:bg-hilo-purple/10">
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-4 py-3 text-left">
                <div className="h-3 w-20 bg-[var(--border)] rounded animate-pulse" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {Array.from({ length: 5 }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c} className="px-4 py-3">
                  <div
                    className="h-3 bg-[var(--border)] rounded animate-pulse"
                    style={{ width: `${50 + ((r * 3 + c * 7) % 40)}%` }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ResultsTableProps {
  results: SparqlResults;
  onUriClick: (uri: string) => void;
}

function ResultsTable({ results, onUriClick }: ResultsTableProps) {
  const vars = results.head.vars;
  const bindings = results.results.bindings;

  if (bindings.length === 0) {
    return (
      <div className="glass rounded-xl p-12 flex flex-col items-center justify-center text-center">
        <FileSearch size={32} className="text-hilo-purple/30 mb-3" />
        <p className="font-display font-semibold text-[var(--text)] mb-1">
          No results
        </p>
        <p className="text-[var(--text-muted)] text-sm">
          The query returned 0 rows.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] shadow-hilo">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-hilo-purple-50 dark:bg-hilo-purple/10 border-b border-[var(--border)]">
            {vars.map((v) => (
              <th
                key={v}
                className="px-4 py-3 text-left font-display font-semibold text-hilo-purple text-xs uppercase tracking-wide"
              >
                ?{v}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {bindings.map((row, i) => (
            <tr
              key={i}
              className="hover:bg-hilo-purple-50/50 dark:hover:bg-hilo-purple/5 transition-colors"
            >
              {vars.map((v) => (
                <td key={v} className="px-4 py-3 align-top">
                  {row[v] ? (
                    <CellValue
                      value={row[v].value}
                      type={row[v].type}
                      onUriClick={onUriClick}
                    />
                  ) : (
                    <span className="text-[var(--text-muted)] text-xs italic">
                      &mdash;
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] text-xs">
        {bindings.length} row{bindings.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

// ─── Mode toggle ──────────────────────────────────────────────────────────────

type Mode = "sparql" | "ask";

interface ModeToggleProps {
  mode: Mode;
  onChange: (mode: Mode) => void;
}

function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
      <button
        onClick={() => onChange("sparql")}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
          ${mode === "sparql"
            ? "bg-hilo-purple text-white shadow-sm"
            : "text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
      >
        <Database size={13} />
        SPARQL
      </button>
      <button
        onClick={() => onChange("ask")}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
          ${mode === "ask"
            ? "bg-hilo-purple text-white shadow-sm"
            : "text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
      >
        <Sparkles size={13} />
        Ask AI
      </button>
    </div>
  );
}

// ─── Generated SPARQL section ─────────────────────────────────────────────────

interface GeneratedSparqlProps {
  sparql: string;
  onCopyToEditor: (sparql: string) => void;
}

function GeneratedSparql({ sparql, onCopyToEditor }: GeneratedSparqlProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="glass rounded-xl border border-[var(--border)] overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm text-[var(--text-muted)]
          hover:text-[var(--text)] hover:bg-hilo-purple-50/40 dark:hover:bg-hilo-purple/5
          transition-colors"
      >
        <ChevronRight
          size={14}
          className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="font-medium">Generated SPARQL</span>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] p-4 space-y-3">
          <pre className="text-xs font-mono text-[var(--text)] bg-[var(--bg)]
            rounded-lg p-4 overflow-x-auto whitespace-pre-wrap break-all
            border border-[var(--border)]">
            {sparql}
          </pre>
          <button
            onClick={() => onCopyToEditor(sparql)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm
              bg-hilo-purple/10 text-hilo-purple hover:bg-hilo-purple/20 transition-colors"
          >
            <Copy size={13} />
            Copy to editor
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Ask AI panel ─────────────────────────────────────────────────────────────

interface AskPanelProps {
  onResults: (results: SparqlResults) => void;
  onError: (error: string | null) => void;
  onCopyToEditor: (sparql: string) => void;
  error: string | null;
}

function AskPanel({ onResults, onError, onCopyToEditor, error }: AskPanelProps) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedSparql, setGeneratedSparql] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  const handleAsk = async () => {
    if (!question.trim() || loading) return;
    setLoading(true);
    onError(null);
    setGeneratedSparql(null);

    try {
      const resp: AskResponse = await askNaturalLanguage(question.trim());

      if (resp.error) {
        // 501 "not configured" is surfaced as an error string from askNaturalLanguage
        if (resp.error.toLowerCase().includes("not configured")) {
          setNotConfigured(true);
          return;
        }
        onError(resp.error);
        if (resp.sparql) setGeneratedSparql(resp.sparql);
        return;
      }

      if (resp.sparql) setGeneratedSparql(resp.sparql);
      if (resp.results) onResults(resp.results);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleAsk();
    }
  };

  if (notConfigured) {
    return (
      <div className="glass rounded-hilo p-8 flex flex-col items-center justify-center text-center space-y-3">
        <Sparkles size={32} className="text-hilo-purple/30" />
        <p className="font-display font-semibold text-[var(--text)]">
          Ask AI is not configured
        </p>
        <p className="text-[var(--text-muted)] text-sm max-w-xs">
          Add your{" "}
          <code className="px-1 py-0.5 rounded bg-[var(--border)] text-xs font-mono">
            ANTHROPIC_API_KEY
          </code>{" "}
          to your node's env file and restart to enable this feature.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Input card */}
      <div className="glass rounded-hilo shadow-hilo p-5 space-y-3">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={loading}
          placeholder="Ask a question about your data…"
          className="w-full rounded-lg px-4 py-3 text-sm resize-none
            bg-[var(--bg)] border border-[var(--border)]
            text-[var(--text)] placeholder-[var(--text-muted)]
            focus:outline-none focus:ring-2 focus:ring-hilo-purple/40
            disabled:opacity-60 transition-colors"
        />
        <div className="flex justify-end">
          <button
            onClick={handleAsk}
            disabled={loading || !question.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg
              bg-hilo-purple text-white text-sm font-medium
              hover:bg-hilo-purple-dark disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors shadow-sm"
          >
            {loading ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Thinking…
              </>
            ) : (
              <>
                <Sparkles size={13} />
                Ask
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40">
          <AlertCircle
            size={16}
            className="text-red-500 dark:text-red-400 shrink-0 mt-0.5"
          />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-0.5">
              Ask AI error
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 font-mono break-all">
              {error}
            </p>
          </div>
        </div>
      )}

      {/* Generated SPARQL (only shown after a successful response) */}
      {generatedSparql && !error && (
        <GeneratedSparql sparql={generatedSparql} onCopyToEditor={onCopyToEditor} />
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

const DEFAULT_QUERY = PRESETS[0].sparql;

export default function DataExplorer() {
  const [mode, setMode] = useState<Mode>("sparql");

  // Shared results — both modes write here so switching modes keeps the table
  const [results, setResults] = useState<SparqlResults | null>(null);
  const [loading, setLoading] = useState(false);

  // SPARQL mode state
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [sparqlError, setSparqlError] = useState<string | null>(null);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<string>("All triples");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Ask AI mode state
  const [askError, setAskError] = useState<string | null>(null);

  // ── SPARQL handlers ──────────────────────────────────────────────────────────

  const runQuery = useCallback(async (sparql: string) => {
    setLoading(true);
    setSparqlError(null);
    setResults(null);
    try {
      const data = await runSparqlQuery(sparql);
      setResults(data);
    } catch (e) {
      setSparqlError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRun = () => runQuery(query);

  const handleReset = () => {
    setQuery(DEFAULT_QUERY);
    setResults(null);
    setSparqlError(null);
    setActivePreset("All triples");
  };

  const handlePreset = (preset: Preset) => {
    setQuery(preset.sparql);
    setActivePreset(preset.label);
    setPresetsOpen(false);
    setResults(null);
    setSparqlError(null);
  };

  const handleUriClick = (uri: string) => {
    const describeQuery = `SELECT ?predicate ?object\nWHERE {\n  <${uri}> ?predicate ?object\n}`;
    setQuery(describeQuery);
    setActivePreset("");
    setMode("sparql");
    runQuery(describeQuery);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      runQuery(query);
    }
  };

  // ── Ask AI → copy to SPARQL editor ──────────────────────────────────────────

  const handleCopyToEditor = (sparql: string) => {
    setQuery(sparql);
    setActivePreset("");
    setMode("sparql");
  };

  // ── Ask AI results handler ───────────────────────────────────────────────────

  const handleAskResults = (data: SparqlResults) => {
    setResults(data);
  };

  // ── Active error (whichever mode is active) ──────────────────────────────────

  const activeError = mode === "sparql" ? sparqlError : askError;

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display font-extrabold text-[var(--text)] text-2xl mb-1">
            Data Explorer
          </h1>
          <p className="text-[var(--text-muted)] text-sm">
            {mode === "sparql" ? (
              <>
                Write SPARQL SELECT queries to explore the RDF graph.{" "}
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--border)] text-[var(--text-muted)] text-xs font-mono">
                  &#8984; Enter
                </kbd>{" "}
                to run.
              </>
            ) : (
              "Ask a question in plain English — the AI translates it to SPARQL and runs it for you."
            )}
          </p>
        </div>
        <ModeToggle mode={mode} onChange={setMode} />
      </div>

      {/* ── SPARQL mode ───────────────────────────────────────────────────────── */}
      {mode === "sparql" && (
        <div className="glass rounded-hilo shadow-hilo p-5 space-y-4">
          {/* Toolbar row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Preset picker */}
            <div className="relative">
              <button
                onClick={() => setPresetsOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                  bg-[var(--surface)] border border-[var(--border)]
                  text-[var(--text)] text-sm font-medium
                  hover:bg-hilo-purple-50 dark:hover:bg-hilo-purple/10 transition-colors"
              >
                <Database size={14} className="text-hilo-purple" />
                {activePreset || "Custom"}
                <ChevronDown
                  size={13}
                  className={`text-[var(--text-muted)] transition-transform ${presetsOpen ? "rotate-180" : ""}`}
                />
              </button>

              {presetsOpen && (
                <div
                  className="absolute left-0 top-full mt-1 w-64 z-20 glass rounded-xl
                    shadow-hilo border border-[var(--border)] overflow-hidden"
                >
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => handlePreset(p)}
                      className={`w-full text-left px-4 py-3 text-sm transition-colors
                        hover:bg-hilo-purple-50 dark:hover:bg-hilo-purple/10
                        ${activePreset === p.label ? "bg-hilo-purple/10" : ""}
                        border-b border-[var(--border)] last:border-0`}
                    >
                      <p className="font-medium text-[var(--text)]">{p.label}</p>
                      <p className="text-[var(--text-muted)] text-xs mt-0.5">
                        {p.description}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1" />

            {/* Action buttons */}
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                border border-[var(--border)] text-[var(--text-muted)] text-sm
                hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
            >
              <RotateCcw size={13} />
              Reset
            </button>
            <button
              onClick={handleRun}
              disabled={loading || !query.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg
                bg-hilo-purple text-white text-sm font-medium
                hover:bg-hilo-purple-dark disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors shadow-sm"
            >
              <Play size={13} />
              {loading ? "Running\u2026" : "Run"}
            </button>
          </div>

          {/* SPARQL textarea */}
          <textarea
            ref={textareaRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActivePreset("");
            }}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            rows={8}
            className="w-full rounded-lg px-4 py-3 text-xs font-mono resize-y
              bg-[var(--bg)] border border-[var(--border)]
              text-[var(--text)] placeholder-[var(--text-muted)]
              focus:outline-none focus:ring-2 focus:ring-hilo-purple/40
              transition-colors"
            placeholder="SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10"
          />
        </div>
      )}

      {/* ── Ask AI mode ───────────────────────────────────────────────────────── */}
      {mode === "ask" && (
        <AskPanel
          onResults={handleAskResults}
          onError={setAskError}
          onCopyToEditor={handleCopyToEditor}
          error={askError}
        />
      )}

      {/* ── SPARQL error (only in SPARQL mode) ───────────────────────────────── */}
      {mode === "sparql" && sparqlError && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40">
          <AlertCircle
            size={16}
            className="text-red-500 dark:text-red-400 shrink-0 mt-0.5"
          />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-0.5">
              Query error
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 font-mono break-all">
              {sparqlError}
            </p>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && <SkeletonTable cols={3} />}

      {/* Results — shared between both modes */}
      {!loading && results && (
        <ResultsTable results={results} onUriClick={handleUriClick} />
      )}

      {/* Empty prompt — only show in SPARQL mode when nothing has run yet */}
      {mode === "sparql" && !loading && !results && !sparqlError && (
        <div className="glass rounded-hilo p-12 flex flex-col items-center justify-center text-center">
          <Database size={36} className="text-hilo-purple/25 mb-3" />
          <p className="font-display font-semibold text-[var(--text)] mb-1">
            Run a query to explore your graph
          </p>
          <p className="text-[var(--text-muted)] text-sm max-w-xs">
            Choose a preset above or write your own SPARQL SELECT query, then
            click <strong className="text-[var(--text)]">Run</strong> or press{" "}
            <kbd className="px-1 py-0.5 rounded bg-[var(--border)] font-mono text-xs">
              &#8984; Enter
            </kbd>
            .
          </p>
        </div>
      )}
    </div>
  );
}
