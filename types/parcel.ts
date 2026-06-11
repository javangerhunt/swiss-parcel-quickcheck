import type { Geometry } from 'geojson';

/** A single result from the geo.admin.ch SearchServer. */
export interface SearchResult {
  label: string;
  lat: number;
  lon: number;
  detail: string;
  origin: string;
}

/** Fully resolved parcel information shown in the panel. */
export interface ParcelInfo {
  egrid: string;
  number: string;
  canton: string;
  label: string;
  areaM2: number;
  geoportalUrl: string | null;
  /** Parcel outline in WGS84, ready for Leaflet display. */
  geometryWgs84: Geometry | null;
  /** The clicked / searched point (WGS84). */
  lat: number;
  lon: number;
  /** The same point in LV95 [easting, northing] — used for identify calls. */
  lv95: [number, number];
}

export type DenkmalStatus =
  | 'idle'
  | 'loading'
  | 'clear'
  | 'isos'
  | 'kgs'
  | 'both'
  | 'error';

export interface WatchlistEntry {
  egrid: string;
  label: string;
  areaM2: number;
  zone: string;
  lat: number;
  lon: number;
  denkmalschutz: boolean;
  addedAt: string;
  notes?: string;
}
