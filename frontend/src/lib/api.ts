// Every request goes through /api, which Vite proxies to FastAPI in dev
// (see vite.config.ts) and which FastAPI serves directly in prod (same
// origin, since it hosts the built frontend too). Components never need
// to know the backend's actual host/port.
const API_BASE = "/api";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || `Request failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}
