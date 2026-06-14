import { apiGet } from '@/lib/apiClient';
import type { ParcelInfo, SearchResult } from '@/types/parcel';

/**
 * Thin clients for the FastAPI backend. All geo.admin.ch / GWR / ÖREB logic now
 * lives in the backend; these functions just call the corresponding `/api`
 * endpoints and pass the responses through with the right types.
 */

/** Address / parcel search — proxied to the backend SearchServer wrapper. */
export async function searchLocations(
  query: string,
  signal?: AbortSignal
): Promise<SearchResult[]> {
  const results = await apiGet<SearchResult[]>('/search', { q: query }, signal);
  // The backend sends bbox as a 4-tuple or null; coerce null to undefined so it
  // fits SearchResult's optional `bbox?` field.
  return results.map((r) => ({ ...r, bbox: r.bbox ?? undefined }));
}

/**
 * A fully resolved parcel as returned by the backend: every ParcelInfo field
 * plus the harmonized planning zone (separate from the precise ÖREB zone).
 */
export type ParcelData = ParcelInfo & { zone: string | null };

/** Backend `/api/parcel` response, which is `{ found: false }` or a ParcelData. */
type ParcelResponse = ({ found: true } & ParcelData) | { found: false };

/**
 * Parcel + zone lookup for a WGS84 point. Returns null when no parcel exists at
 * the point; otherwise the full ParcelData (already carries lat, lon, lv95,
 * oerebPdfUrl and geometryWgs84 computed by the backend).
 */
export async function fetchParcel(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<ParcelData | null> {
  const res = await apiGet<ParcelResponse>('/parcel', { lat, lon }, signal);
  if (res.found === false) return null;
  return res as ParcelData;
}

export type DenkmalCheckResult = 'clear' | 'isos' | 'kgs' | 'both';

/**
 * Heritage-protection check (ISOS townscapes + KGS cultural property) for an
 * LV95 point — delegated to the backend.
 */
export async function checkDenkmalschutz(
  easting: number,
  northing: number,
  signal?: AbortSignal
): Promise<DenkmalCheckResult> {
  const res = await apiGet<{ status: DenkmalCheckResult }>(
    '/denkmalschutz',
    { easting, northing },
    signal
  );
  return res.status;
}
