import React, { useEffect, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { fetchHealth } from "../api/health";
import { HealthStatus } from "../types";

interface ServiceCardProps {
  name: string;
  status: string;
}

function StatusBadge({ status }: { status: string }) {
  const isOk = status === "ok";
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        isOk
          ? "bg-green-50 text-green-700"
          : "bg-red-50 text-red-700"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isOk ? "bg-green-500" : "bg-red-500"}`}
      />
      {isOk ? "Healthy" : status}
    </span>
  );
}

function ServiceCard({ name, status }: ServiceCardProps) {
  return (
    <div className="bg-white rounded-hilo shadow-hilo p-6 border-l-4 border-hilo-purple flex items-center justify-between">
      <div>
        <p className="text-hilo-dark/50 text-xs font-medium uppercase tracking-wide mb-1">
          Service
        </p>
        <h3 className="font-display font-semibold text-hilo-dark text-lg">{name}</h3>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-hilo shadow-hilo p-6 border-l-4 border-hilo-gray animate-pulse">
      <div className="h-3 w-16 bg-gray-200 rounded mb-2" />
      <div className="h-5 w-24 bg-gray-200 rounded" />
    </div>
  );
}

export default function Dashboard() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchHealth();
      setHealth(data);
    } catch (err) {
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
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-bold text-hilo-dark text-2xl mb-1">
            Node Status:{" "}
            {loading ? (
              <span className="text-hilo-dark/40">Loading…</span>
            ) : error ? (
              <span className="text-red-600">Unavailable</span>
            ) : (
              <span className={overallHealthy ? "text-green-600" : "text-yellow-600"}>
                {overallHealthy ? "Healthy" : "Degraded"}
              </span>
            )}
          </h1>
          <p className="text-hilo-dark/50 text-sm">Refreshes every 10 seconds</p>
        </div>
        <button
          onClick={() => { setLoading(true); load(); }}
          className="flex items-center gap-2 px-4 py-2 rounded-hilo bg-hilo-purple-50 text-hilo-purple hover:bg-hilo-purple-100 transition-colors text-sm font-medium"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="bg-red-50 text-red-700 rounded-hilo p-6 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => { setLoading(true); load(); }}
            className="ml-4 px-3 py-1.5 rounded-hilo bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium transition-colors"
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
              <ServiceCard name="API" status={health ? "ok" : "error"} />
              <ServiceCard name="GraphDB" status={health?.graphdb ?? "unknown"} />
              <ServiceCard name="Queue" status={health?.queue ?? "unknown"} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
