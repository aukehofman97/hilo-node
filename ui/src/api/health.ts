import { HealthStatus } from "../types";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

export async function fetchHealth(): Promise<HealthStatus> {
  const response = await fetch(`${API_URL}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  return response.json();
}
