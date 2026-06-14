import { gwrBuildingsInBbox, identifyParcel, identifyZone } from '@/lib/geoAdmin';
import { lv95ToWgs84, planarAreaM2 } from '@/lib/coordinates';

export interface AreaFilters {
  /** Harmonized zone category to match (substring), or null for any. */
  zone: string | null;
  minM2: number | null;
  maxM2: number | null;
  minYear: number | null;
  maxYear: number | null;
}

export interface AreaResult {
  egrid: string;
  number: string;
  address: string | null;
  areaM2: number;
  zone: string | null;
  baujahr: number | null;
  lat: number;
  lon: number;
}

export interface AreaSearchOutcome {
  results: AreaResult[];
  /** Distinct parcels (with a building) found in the area before per-parcel filtering. */
  scanned: number;
  /** True if the GWR area query hit its result cap (area not fully covered). */
  capped: boolean;
}

/** The harmonized zone categories offered as filter options. */
export const ZONE_OPTIONS = [
  'Wohnzonen',
  'Arbeitszonen',
  'Zentrumszonen',
  'Mischzonen',
  'Zonen für öffentliche Nutzungen',
  'eingeschränkte Bauzonen',
  'Tourismus- und Freizeitzonen',
  'Verkehrszonen innerhalb der Bauzonen',
  'Weitere Bauzonen',
];

const GWR_CAP = 200; // geo.admin identify limit
const MAX_PARCEL_LOOKUPS = 90; // bound the per-parcel area/zone calls

/** Runs callbacks over items with a bounded concurrency. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Searches a bounding box for parcels (with buildings, from the GWR) and resolves
 * each parcel's area + zone, then applies the filters. Bounded by a GWR result
 * cap and a per-parcel lookup cap, so for large municipalities this is a sample,
 * not an exhaustive list.
 */
export async function searchArea(
  bbox: [number, number, number, number],
  filters: AreaFilters,
  opts: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {}
): Promise<AreaSearchOutcome> {
  const buildings = await gwrBuildingsInBbox(bbox, opts.signal);
  const capped = buildings.length >= GWR_CAP;

  // Dedupe to parcels, keeping the newest building year as representative.
  const byParcel = new Map<string, { egrid: string; number: string; address: string | null; baujahr: number | null; easting: number; northing: number }>();
  for (const b of buildings) {
    const existing = byParcel.get(b.egrid);
    if (!existing) {
      byParcel.set(b.egrid, { ...b });
    } else if ((b.baujahr ?? 0) > (existing.baujahr ?? 0)) {
      existing.baujahr = b.baujahr;
    }
  }

  // Pre-filter on the year (cheap — no extra calls) before per-parcel lookups.
  let parcels = Array.from(byParcel.values()).filter((p) => {
    if (filters.minYear != null && (p.baujahr == null || p.baujahr < filters.minYear)) return false;
    if (filters.maxYear != null && (p.baujahr == null || p.baujahr > filters.maxYear)) return false;
    return true;
  });

  const scanned = parcels.length;
  parcels = parcels.slice(0, MAX_PARCEL_LOOKUPS);

  let done = 0;
  const total = parcels.length;
  const resolved = await mapLimit(parcels, 8, async (p) => {
    try {
      const [parcel, zone] = await Promise.all([
        identifyParcel(p.easting, p.northing, opts.signal),
        identifyZone(p.easting, p.northing, opts.signal),
      ]);
      const [lat, lon] = lv95ToWgs84(p.easting, p.northing);
      const areaM2 = parcel?.geometry ? Math.round(planarAreaM2(parcel.geometry)) : 0;
      return {
        egrid: p.egrid,
        number: parcel?.number || p.number,
        address: p.address,
        areaM2,
        zone,
        baujahr: p.baujahr,
        lat,
        lon,
      } as AreaResult;
    } catch {
      return null;
    } finally {
      done += 1;
      opts.onProgress?.(done, total);
    }
  });

  const results = resolved
    .filter((r): r is AreaResult => r !== null)
    .filter((r) => {
      if (filters.minM2 != null && r.areaM2 < filters.minM2) return false;
      if (filters.maxM2 != null && r.areaM2 > filters.maxM2) return false;
      if (filters.zone && !(r.zone ?? '').toLowerCase().includes(filters.zone.toLowerCase()))
        return false;
      return true;
    })
    .sort((a, b) => b.areaM2 - a.areaM2);

  return { results, scanned, capped };
}
