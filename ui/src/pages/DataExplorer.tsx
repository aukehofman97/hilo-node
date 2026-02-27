import React from "react";
import { Database } from "lucide-react";

export default function DataExplorer() {
  return (
    <div className="animate-fade-in">
      <h1 className="font-display font-extrabold text-[var(--text)] text-2xl mb-2">
        Data Explorer
      </h1>
      <p className="text-[var(--text-muted)] text-sm mb-8">
        Query and browse RDF triples stored in the graph database.
      </p>
      <div className="glass rounded-hilo shadow-hilo p-16 flex flex-col items-center justify-center text-center">
        <Database size={40} className="text-hilo-purple/30 mb-4" />
        <p className="font-display font-semibold text-[var(--text)] mb-1">Coming soon</p>
        <p className="text-[var(--text-muted)] text-sm">SPARQL query interface will appear here.</p>
      </div>
    </div>
  );
}
