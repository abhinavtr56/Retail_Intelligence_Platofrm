// Every request goes through /api, which Vite proxies to FastAPI in dev
// (see vite.config.ts) and which FastAPI serves directly in prod (same
// origin, since it hosts the built frontend too). Components never need
// to know the backend's actual host/port.
const API_BASE = "/api";

export class ApiError extends Error {
  status: number;
  /** The server answered "there is no dataset loaded yet".
   *
   *  `app/main.py` replies to every data-backed route with a 503 carrying
   *  `dataset_missing: true` when the six star-schema CSVs are absent, and its
   *  docstring calls this "the flag the UI keys on". Nothing read it until now,
   *  so a dataset removed mid-session surfaced as a generic "Unable to load
   *  data — Retry", which is both the wrong explanation and an action that
   *  cannot work. Carried here so every caller can tell the two apart without
   *  re-parsing the body. */
  datasetMissing: boolean;
  constructor(status: number, message: string, datasetMissing = false) {
    super(message);
    this.status = status;
    this.datasetMissing = datasetMissing;
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

// Multipart upload. Deliberately does NOT set Content-Type — the browser has
// to generate it so the multipart boundary matches the body it builds.
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", body: formData });
  return unwrap<T>(res);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
  return unwrap<T>(res);
}

/** FastAPI reports errors as `{"detail": ...}`, where `detail` is a string for
 *  an HTTPException and a list of field errors for a 422. Surfacing the raw
 *  JSON of a validation failure is unreadable, so pull out the message.
 *
 *  Every verb above funnels through here, so a caller — the login form, the
 *  dataset uploader — gets the same clean `ApiError` regardless of method. */
async function unwrap<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;
  const text = await res.text().catch(() => "");
  const { message, datasetMissing } = parseError(text);
  throw new ApiError(
    res.status,
    message || `Request failed: ${res.status} ${res.statusText}`,
    datasetMissing,
  );
}

/** Pull both the readable message and the dataset flag out of one parse.
 *
 *  `detail` is a string for an HTTPException and a list of field errors for a
 *  422; surfacing the raw JSON of a validation failure is unreadable, so the
 *  list is flattened. `dataset_missing` sits beside `detail` on the 503 the
 *  no-dataset handler returns. */
function parseError(body: string): { message: string; datasetMissing: boolean } {
  try {
    const parsed = JSON.parse(body) as { detail?: unknown; dataset_missing?: unknown };
    const datasetMissing = parsed.dataset_missing === true;
    const detail = parsed.detail;
    if (typeof detail === "string") return { message: detail, datasetMissing };
    if (Array.isArray(detail)) {
      const message = detail
        .map((e) => {
          const { loc, msg } = e as { loc?: unknown[]; msg?: string };
          const field = Array.isArray(loc) ? loc.filter((p) => p !== "body").join(".") : "";
          return field ? `${field}: ${msg}` : String(msg);
        })
        .join("; ");
      return { message, datasetMissing };
    }
    return { message: body, datasetMissing };
  } catch {
    /* not JSON — fall through to the raw body */
  }
  return { message: body, datasetMissing: false };
}
