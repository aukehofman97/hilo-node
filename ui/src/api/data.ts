const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

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
