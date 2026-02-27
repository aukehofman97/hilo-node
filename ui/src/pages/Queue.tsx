import React from "react";
import { MessageSquare } from "lucide-react";

export default function Queue() {
  return (
    <div className="animate-fade-in">
      <h1 className="font-display font-extrabold text-[var(--text)] text-2xl mb-2">
        Queue Inspector
      </h1>
      <p className="text-[var(--text-muted)] text-sm mb-8">
        Monitor RabbitMQ queue depth, dead-letter messages, and consumer status.
      </p>
      <div className="glass rounded-hilo shadow-hilo p-16 flex flex-col items-center justify-center text-center">
        <MessageSquare size={40} className="text-hilo-purple/30 mb-4" />
        <p className="font-display font-semibold text-[var(--text)] mb-1">Coming soon</p>
        <p className="text-[var(--text-muted)] text-sm">Queue status and dead-letter inspector will appear here.</p>
      </div>
    </div>
  );
}
