import { apiGet } from '@/lib/apiClient';

/** A precise cantonal land-use zone and the share of the parcel it covers. */
export interface ExactZone {
  zone: string;
  /** Percentage of the parcel in this zone, or null when no area is reported. */
  percent: number | null;
}

/** Formats zones as "80% Wohnzone 2, 20% Wohnzone 4" (or just the names). */
export function formatExactZones(zones: ExactZone[]): string {
  return zones
    .map((z) => (z.percent != null ? `${z.percent}% ${z.zone}` : z.zone))
    .join(', ');
}

/**
 * Fetches the precise cantonal land-use zone(s) for a parcel from the ÖREB
 * cadastre via the backend — e.g. "Wohnzone 2" instead of the harmonized
 * "Wohnzonen" — together with the share of the parcel each zone covers.
 *
 * Returns the zones ordered by area share (largest first; a parcel can span
 * several zones), or null when the canton has no service, the request fails, or
 * no land-use plan is published for the parcel.
 */
export async function fetchExactZones(
  canton: string,
  egrid: string,
  signal?: AbortSignal
): Promise<ExactZone[] | null> {
  const res = await apiGet<{ available: boolean; zones: ExactZone[] }>(
    '/exact-zone',
    { canton, egrid },
    signal
  );
  if (res.available === false || res.zones.length === 0) return null;
  return res.zones;
}
