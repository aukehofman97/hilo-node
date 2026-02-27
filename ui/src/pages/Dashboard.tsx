import React, { useEffect, useState, useCallback } from "react";
import { RefreshCw, Server, Database, MessageSquare } from "lucide-react";
import { fetchHealth } from "../api/health";
import { HealthStatus } from "../types";

interface ServiceCardProps {
  name: string;
  status: string;
  icon: React.ReactNode;
}

function StatusBadge({ status }: { status: string }) {
  const isOk = status === "ok";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
        isOk
          ? "bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400"
          : "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400"
      }`}
    >
      {isOk ? (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
        </span>
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      )}
      {isOk ? "Healthy" : "Error"}
    </span>
  );
}

function ServiceCard({ name, status, icon }: ServiceCardProps) {
  const isOk = status === "ok";
  return (
    <div
      className={`glass rounded-hilo shadow-hilo p-6 flex items-center justify-between transition-all duration-200 hover:shadow-hilo-lg hover:scale-[1.01] border-l-4 ${
        isOk ? "border-l-hilo-purple" : "border-l-red-400"
      }`}
    >
      <div className="flex items-center gap-4">
        <div
          className={`w-10 h-10 rounded-hilo flex items-center justify-center ${
            isOk
              ? "bg-hilo-purple-50 dark:bg-hilo-purple/20 text-hilo-purple"
              : "bg-red-50 dark:bg-red-950/40 text-red-500"
          }`}
        >
          {icon}
        </div>
        <div>
          <p className="text-[var(--text-muted)] text-xs font-medium uppercase tracking-widest mb-0.5">
            Service
          </p>
          <h3 className="font-display font-semibold text-[var(--text)] text-base leading-tight">
            {name}
          </h3>
        </div>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="glass rounded-hilo shadow-hilo p-6 animate-pulse border-l-4 border-l-[var(--border)]">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-hilo bg-[var(--border)]" />
        <div className="flex-1 space-y-2">
          <div className="h-2.5 w-12 rounded bg-[var(--border)]" />
          <div className="h-4 w-20 rounded bg-[var(--border)]" />
        </div>
        <div className="h-6 w-16 rounded-full bg-[var(--border)]" />
      </div>
    </div>
  );
}

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  API: <Server size={18} />,
  GraphDB: <Database size={18} />,
  Queue: <MessageSquare size={18} />,
};

export default function Dashboard() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchHealth();
      setHealth(data);
    } catch {
      setError("Could not reach API");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, [load]);

  const overallHealthy = health?.status === "healthy";

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-display font-extrabold text-[var(--text)] text-2xl">
              Node Status
            </h1>
            {!loading && !error && (
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  overallHealthy
                    ? "bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400"
                    : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                }`}
              >
                {overallHealthy ? "All systems go" : "Degraded"}
              </span>
            )}
          </div>
          <p className="text-[var(--text-muted)] text-sm">
            Live status · refreshes every 10 s
          </p>
        </div>

        <button
          onClick={() => {
            setLoading(true);
            load();
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-hilo-purple-50 hover:bg-hilo-purple-100 dark:bg-hilo-purple/15 dark:hover:bg-hilo-purple/25 text-hilo-purple-dark dark:text-hilo-purple-light text-sm font-medium transition-all duration-200"
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      {/* Error state */}
      {error ? (
        <div className="glass rounded-hilo p-6 flex items-center justify-between border-l-4 border-l-red-400 animate-fade-in">
          <div>
            <p className="font-semibold text-red-600 dark:text-red-400 mb-0.5">
              API unreachable
            </p>
            <p className="text-[var(--text-muted)] text-sm">{error}</p>
          </div>
          <button
            onClick={() => {
              setLoading(true);
              load();
            }}
            className="px-4 py-2 rounded-full bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-950/60 text-red-700 dark:text-red-400 text-sm font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : (
            <>
              <ServiceCard
                name="API"
                status={health ? "ok" : "error"}
                icon={SERVICE_ICONS["API"]}
              />
              <ServiceCard
                name="GraphDB"
                status={health?.graphdb ?? "unknown"}
                icon={SERVICE_ICONS["GraphDB"]}
              />
              <ServiceCard
                name="Queue"
                status={health?.queue ?? "unknown"}
                icon={SERVICE_ICONS["Queue"]}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
