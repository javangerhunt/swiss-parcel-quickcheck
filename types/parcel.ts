/**
 * parcel.ts — the shared TypeScript types used across the frontend.
 *
 * These interfaces describe the shape of the data the app passes around: search
 * hits, the resolved details of a land parcel, owner records, comments and the
 * saved "watchlist" entries. Defining them once here means the components, hooks
 * and lib helpers all agree on the exact same structure, and TypeScript flags any
 * field that is misspelled, missing or the wrong type.
 *
 * Domain terms used below:
 *   - EGRID    : the unique, Switzerland-wide identifier of a land parcel.
 *   - LV95     : the Swiss national coordinate grid (easting/northing, in metres).
 *   - WGS84    : ordinary GPS latitude/longitude, what the map (Leaflet) uses.
 *   - OEREB    : the cadastre of public-law restrictions on a property.
 *   - ISOS/KGS : national heritage inventories (protected townscapes / cultural
 *                property objects); a parcel inside one counts as "Denkmalschutz".
 *   - Gemeinde : a Swiss political municipality.
 */
import type { Geometry } from 'geojson';

/** A single result from the geo.admin.ch SearchServer (one row in the search dropdown). */
export interface SearchResult {
  label: string; // human-readable text shown in the dropdown
  lat: number; // WGS84 latitude of the result
  lon: number; // WGS84 longitude of the result
  detail: string; // the API's internal detail string (also used to build a stable React key)
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
  egrid: string; // unique Switzerland-wide parcel identifier
  number: string; // the local parcel number, e.g. "2243"
  canton: string; // two-letter canton code, e.g. "ZG"
  label: string; // display title for the parcel
  areaM2: number; // parcel area in square metres (0 when unknown)
  /** Link to the canton's own geoportal for this parcel, or null if none. */
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

/**
 * Heritage-protection check status for a parcel, used by DenkmalschutzBadge:
 *   idle    = not checked yet            loading = check in progress
 *   clear   = in neither inventory       isos    = in the ISOS townscape inventory
 *   kgs     = in the KGS cultural-property inventory
 *   both    = in both ISOS and KGS       error   = the check failed
 */
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
  id: string; // unique id (used as the React key and to target edits/deletes)
  text: string; // the comment body
  /** ISO timestamp of when the comment was posted. */
  createdAt: string;
  /** ISO timestamp of the last edit, if the comment was edited. */
  updatedAt?: string;
}

/**
 * Structured owner / Eigentümer details. Every field is optional because the
 * user fills these in by hand and may know only some of them. The German field
 * names mirror the form labels (vorname = first name, name = surname,
 * strasse = street, plz = postal code, ort = town/place).
 */
export interface OwnerInfo {
  vorname?: string;
  name?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  telefon?: string;
  email?: string;
}

/** One saved ("starred") parcel in the user's watchlist, persisted in the browser. */
export interface WatchlistEntry {
  egrid: string; // unique parcel id; also the entry's key in the watchlist
  /** Parcel number, e.g. "2243". */
  number?: string;
  label: string; // display title for the parcel
  areaM2: number; // parcel area in square metres (0 when unknown)
  /** Harmonized federal zone category, e.g. "Wohnzonen". */
  zone: string;
  /** Precise cantonal zone(s) from the ÖREB cadastre, e.g. "Wohnzone 2". */
  exactZone?: string;
  /** Structured owner details (Vorname, Name, Adresse, …). */
  ownerInfo?: OwnerInfo;
  /** Owner as a single string — derived from ownerInfo; used for grouping,
   *  colouring and export, and kept for older free-text entries. */
  owner?: string;
  address?: string; // street + house number, if known
  plz?: string; // postal code
  place?: string; // place / Ortschaft name
  gemeinde?: string; // political municipality
  lat: number; // WGS84 latitude (used to re-open the parcel and to colour the map)
  lon: number; // WGS84 longitude
  /** Parcel outline (WGS84) — stored so it can be drawn on the owner map. */
  geometry?: Geometry | null;
  denkmalschutz: boolean; // true if the parcel is in a national heritage inventory (ISOS/KGS)
  addedAt: string; // ISO timestamp of when it was saved (used for "newest first" sorting)
  /** Timestamped comments / Kommentare. */
  comments?: ParcelComment[];
  /** Legacy single-string note — migrated into `comments` on load. */
  notes?: string;
}
