/**
 * Typed frontend client for the backend's /area-search endpoint, plus the shared
 * filter / result types and the list of zone categories offered in the filter UI.
 * The actual area search (scanning the building register and resolving each
 * parcel's area and zone) runs in the FastAPI backend; searchArea here just
 * forwards the bounding box and filters and returns the typed result.
 */
import { apiGet } from '@/lib/apiClient';

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

/**
 * Searches a bounding box for parcels (with buildings) and resolves each
 * parcel's area + zone, then applies the filters — all done by the backend,
 * which bounds the work by a GWR result cap and a per-parcel lookup cap. So for
 * large municipalities this is a sample, not an exhaustive list.
 *
 * `opts.onProgress` is kept for signature compatibility but is never called now
 * that the search runs as a single backend request. `opts.signal` aborts it.
 */
export async function searchArea(
  bbox: [number, number, number, number],
  filters: AreaFilters,
  opts: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {}
): Promise<AreaSearchOutcome> {
  return apiGet<AreaSearchOutcome>(
    '/area-search',
    {
      xmin: bbox[0],
      ymin: bbox[1],
      xmax: bbox[2],
      ymax: bbox[3],
      zone: filters.zone,
      minM2: filters.minM2,
      maxM2: filters.maxM2,
      minYear: filters.minYear,
      maxYear: filters.maxYear,
    },
    opts.signal
  );
}
