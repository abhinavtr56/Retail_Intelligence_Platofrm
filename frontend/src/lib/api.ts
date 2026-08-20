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
  return unwrap<T>(res);
}

/** POST a JSON body. The first write path in the app — the Simulation Studio's
 *  /simulation/run, which carries a filter state and a lever payload that are
 *  too structured for a query string.
 *
 *  Deliberately the same shape and the same `ApiError` as `apiFetch`, so a
 *  caller handles failure identically whichever verb it used. */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return unwrap<T>(res);
}

/** FastAPI reports errors as `{"detail": ...}`, where `detail` is a string for
 *  an HTTPException and a list of field errors for a 422. Surfacing the raw
 *  JSON of a validation failure is unreadable, so pull out the message. */
async function unwrap<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;
  const text = await res.text().catch(() => "");
  throw new ApiError(res.status, detailOf(text) || `Request failed: ${res.status} ${res.statusText}`);
}

function detailOf(body: string): string {
  try {
    const detail = (JSON.parse(body) as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((e) => {
          const { loc, msg } = e as { loc?: unknown[]; msg?: string };
          const field = Array.isArray(loc) ? loc.filter((p) => p !== "body").join(".") : "";
          return field ? `${field}: ${msg}` : String(msg);
        })
        .join("; ");
    }
  } catch {
    /* not JSON — fall through to the raw body */
  }
  return body;
}
