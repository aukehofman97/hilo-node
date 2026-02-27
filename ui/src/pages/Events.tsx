import React from "react";
import { Zap } from "lucide-react";

export default function Events() {
  return (
    <div className="animate-fade-in">
      <h1 className="font-display font-extrabold text-[var(--text)] text-2xl mb-2">
        Events Monitor
      </h1>
      <p className="text-[var(--text-muted)] text-sm mb-8">
        Real-time event stream from the node queue.
      </p>
      <div className="glass rounded-hilo shadow-hilo p-16 flex flex-col items-center justify-center text-center">
        <Zap size={40} className="text-hilo-purple/30 mb-4" />
        <p className="font-display font-semibold text-[var(--text)] mb-1">Coming soon</p>
        <p className="text-[var(--text-muted)] text-sm">Live event stream will appear here.</p>
      </div>
    </div>
  );
}
