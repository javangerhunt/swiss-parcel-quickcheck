/**
 * Tiny client for the FastAPI backend. All data logic now lives there; the
 * browser only calls relative `/api/...` paths, which next.config.mjs rewrites
 * to the backend.
 */

/** Query parameters — null/undefined values are skipped. */
type Params = Record<string, string | number | null | undefined>;

/**
 * GETs `/api{path}` with the given query params and returns the parsed JSON.
 * Skips null/undefined params, forwards an optional AbortSignal, and throws on
 * a non-OK response.
 */
export async function apiGet<T = unknown>(
  path: string,
  params?: Params,
  signal?: AbortSignal
): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value != null) query.set(key, String(value));
  }
  const qs = query.toString();
  const res = await fetch(`/api${path}${qs ? `?${qs}` : ''}`, { signal });
  if (!res.ok) throw new Error(`Anfrage fehlgeschlagen (HTTP ${res.status})`);
  return res.json() as Promise<T>;
}
