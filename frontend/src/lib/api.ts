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

// FastAPI's default error shape is `{"detail": "..."}` — pull that out when
// present so callers (e.g. the login form) get a clean, human-readable
// message instead of a raw JSON blob. Falls back to the raw body for
// non-JSON error responses.
async function errorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  if (!text) return `Request failed: ${res.status} ${res.statusText}`;
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.detail === "string") return parsed.detail;
  } catch {
    // not JSON — fall through to the raw text
  }
  return text;
}

export async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new ApiError(res.status, await errorMessage(res));
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await errorMessage(res));
  }
  return res.json() as Promise<T>;
}

// Multipart upload. Deliberately does NOT set Content-Type — the browser has
// to generate it so the multipart boundary matches the body it builds.
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", body: formData });
  if (!res.ok) {
    throw new ApiError(res.status, await errorMessage(res));
  }
  return res.json() as Promise<T>;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
  if (!res.ok) {
    throw new ApiError(res.status, await errorMessage(res));
  }
  return res.json() as Promise<T>;
}
