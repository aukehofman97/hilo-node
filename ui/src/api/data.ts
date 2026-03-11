const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export interface SparqlBinding {
  [variable: string]: {
    type: "uri" | "literal" | "bnode";
    value: string;
    datatype?: string;
    "xml:lang"?: string;
  };
}

export interface SparqlResults {
  head: { vars: string[] };
  results: { bindings: SparqlBinding[] };
}

export async function runSparqlQuery(sparql: string): Promise<SparqlResults> {
  const resp = await fetch(
    `${API_URL}/data?sparql=${encodeURIComponent(sparql)}`,
    { headers: { Accept: "application/json" } }
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Query failed (${resp.status}): ${text}`);
  }
  return resp.json();
}

export interface AskResponse {
  sparql: string | null;
  results: SparqlResults | null;
  error: string | null;
}

export async function askNaturalLanguage(question: string): Promise<AskResponse> {
  const resp = await fetch(`${API_URL}/data/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ question }),
  });
  if (resp.status === 501) {
    const data = await resp.json();
    return { sparql: null, results: null, error: data.detail ?? "Ask AI is not configured on this node" };
  }
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Ask AI failed (${resp.status}): ${text}`);
  }
  return resp.json();
}
