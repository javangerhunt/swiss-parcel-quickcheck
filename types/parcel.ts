import type { Geometry } from 'geojson';

/** A single result from the geo.admin.ch SearchServer. */
export interface SearchResult {
  label: string;
  lat: number;
  lon: number;
  detail: string;
  /** Result kind: 'address' | 'parcel' | 'gg25' (Gemeinde) | 'zipcode' (Ort). */
  origin: string;
  /** Bounding box in LV95 [xmin, ymin, xmax, ymax] — for Gemeinde/Ort area search. */
  bbox?: [number, number, number, number];
}

/** Address / municipality info resolved for a point. */
export interface LocationInfo {
  /** Street + house number, e.g. "Bahnhofstrasse 5" (null if no building nearby). */
  address: string | null;
  /** 4-digit postal code, e.g. "6300". */
  plz: string | null;
  /** Place / Ortschaft name, e.g. "Zug". */
  place: string | null;
  /** Political municipality, e.g. "Zug". */
  gemeinde: string | null;
}

/** Fully resolved parcel information shown in the panel. */
export interface ParcelInfo {
  egrid: string;
  number: string;
  canton: string;
  label: string;
  areaM2: number;
  geoportalUrl: string | null;
  /** Official ÖREB PDF extract URL for this parcel, or null when unavailable. */
  oerebPdfUrl: string | null;
  /** Parcel outline in WGS84, ready for Leaflet display. */
  geometryWgs84: Geometry | null;
  /** Street address (if a building was found), postal code, place, municipality. */
  address: string | null;
  plz: string | null;
  place: string | null;
  gemeinde: string | null;
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

/** A single timestamped comment / Kommentar on a parcel. */
export interface ParcelComment {
  id: string;
  text: string;
  /** ISO timestamp of when the comment was posted. */
  createdAt: string;
  /** ISO timestamp of the last edit, if the comment was edited. */
  updatedAt?: string;
}

/** Structured owner / Eigentümer details. */
export interface OwnerInfo {
  vorname?: string;
  name?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  telefon?: string;
  email?: string;
}

export interface WatchlistEntry {
  egrid: string;
  /** Parcel number, e.g. "2243". */
  number?: string;
  label: string;
  areaM2: number;
  /** Harmonized federal zone category, e.g. "Wohnzonen". */
  zone: string;
  /** Precise cantonal zone(s) from the ÖREB cadastre, e.g. "Wohnzone 2". */
  exactZone?: string;
  /** Structured owner details (Vorname, Name, Adresse, …). */
  ownerInfo?: OwnerInfo;
  /** Owner as a single string — derived from ownerInfo; used for grouping,
   *  colouring and export, and kept for older free-text entries. */
  owner?: string;
  address?: string;
  plz?: string;
  place?: string;
  gemeinde?: string;
  lat: number;
  lon: number;
  /** Parcel outline (WGS84) — stored so it can be drawn on the owner map. */
  geometry?: Geometry | null;
  denkmalschutz: boolean;
  addedAt: string;
  /** Timestamped comments / Kommentare. */
  comments?: ParcelComment[];
  /** Legacy single-string note — migrated into `comments` on load. */
  notes?: string;
}
