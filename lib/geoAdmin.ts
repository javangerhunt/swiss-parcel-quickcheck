import type { Geometry } from 'geojson';
import type { LocationInfo, SearchResult } from '@/types/parcel';

const SEARCH_URL = 'https://api3.geo.admin.ch/rest/services/api/SearchServer';
const IDENTIFY_URL = 'https://api3.geo.admin.ch/rest/services/all/MapServer/identify';

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '');
}

/** Address / parcel search via the geo.admin.ch SearchServer. */
export async function searchLocations(
  query: string,
  signal?: AbortSignal
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    searchText: query,
    type: 'locations',
    // address + parcel as before, plus Gemeinde (gg25) and Ort/PLZ (zipcode)
    // for the area search. sr=2056 makes geom_st_box2d an LV95 bounding box.
    origins: 'address,parcel,gg25,zipcode',
    lang: 'de',
    limit: '12',
    sr: '2056',
  });
  const res = await fetch(`${SEARCH_URL}?${params}`, { signal });
  if (!res.ok) throw new Error(`Suche fehlgeschlagen (HTTP ${res.status})`);
  const data = await res.json();
  const results: SearchResult[] = (data.results ?? []).map(
    (r: { attrs?: Record<string, unknown> }) => {
      const box = String(r.attrs?.geom_st_box2d ?? '');
      const m = box.match(/BOX\(([-\d.]+) ([-\d.]+),([-\d.]+) ([-\d.]+)\)/);
      const bbox = m
        ? ([+m[1], +m[2], +m[3], +m[4]] as [number, number, number, number])
        : undefined;
      return {
        label: stripHtml(String(r.attrs?.label ?? '')),
        lat: r.attrs?.lat as number,
        lon: r.attrs?.lon as number,
        detail: String(r.attrs?.detail ?? ''),
        origin: String(r.attrs?.origin ?? ''),
        bbox,
      };
    }
  );
  return results.filter(
    (r) => typeof r.lat === 'number' && typeof r.lon === 'number'
  );
}

interface IdentifyFeature {
  featureId?: number | string;
  geometry?: Geometry;
  properties?: Record<string, unknown>;
}

interface IdentifyOptions {
  layer: string;
  returnGeometry?: boolean;
  tolerance?: number;
}

/**
 * Generic identify call against a geo.admin.ch layer at an LV95 point.
 * mapExtent/imageDisplay are sized so that 1 px == 1 m, making the pixel
 * tolerance behave as a tolerance in meters.
 */
async function identify(
  easting: number,
  northing: number,
  { layer, returnGeometry = false, tolerance = 0 }: IdentifyOptions,
  signal?: AbortSignal
): Promise<IdentifyFeature[]> {
  const params = new URLSearchParams({
    geometry: `${easting},${northing}`,
    geometryFormat: 'geojson',
    geometryType: 'esriGeometryPoint',
    layers: `all:${layer}`,
    returnGeometry: String(returnGeometry),
    tolerance: String(tolerance),
    mapExtent: `${easting - 50},${northing - 50},${easting + 50},${northing + 50}`,
    imageDisplay: '100,100,96',
    sr: '2056',
    lang: 'de',
  });
  const res = await fetch(`${IDENTIFY_URL}?${params}`, { signal });
  if (!res.ok) throw new Error(`Abfrage ${layer} fehlgeschlagen (HTTP ${res.status})`);
  const data = await res.json();
  return data.results ?? [];
}

export interface ParcelIdentifyResult {
  number: string;
  egrid: string;
  canton: string;
  geoportalUrl: string | null;
  /** Parcel outline in LV95 (EPSG:2056). */
  geometry: Geometry | null;
}

/** Parcel lookup (number, EGRID, geometry, Geoportal link) at an LV95 point. */
export async function identifyParcel(
  easting: number,
  northing: number,
  signal?: AbortSignal
): Promise<ParcelIdentifyResult | null> {
  const results = await identify(
    easting,
    northing,
    { layer: 'ch.kantone.cadastralwebmap-farbe', returnGeometry: true, tolerance: 0 },
    signal
  );
  const feature = results[0];
  if (!feature) return null;
  const props = feature.properties ?? {};
  return {
    number: String(props.number ?? ''),
    egrid: String(props.egris_egrid ?? ''),
    canton: String(props.ak ?? ''),
    geoportalUrl: props.geoportal_url ? String(props.geoportal_url) : null,
    geometry: feature.geometry ?? null,
  };
}

/**
 * Planning zone at an LV95 point, or null if unavailable.
 * Uses the harmonized building-zone layer ch.are.bauzonen — the layer
 * ch.are.nutzungsplanung-grundnutzung from the original plan is no longer
 * queryable via identify ("No GeoTable was found"). Returns the harmonized
 * German zone category (ch_bez_d), e.g. "Wohnzonen" or "Zentrumszonen".
 */
export async function identifyZone(
  easting: number,
  northing: number,
  signal?: AbortSignal
): Promise<string | null> {
  const results = await identify(
    easting,
    northing,
    { layer: 'ch.are.bauzonen', returnGeometry: false, tolerance: 0 },
    signal
  );
  const props = results[0]?.properties ?? {};
  const name = props.ch_bez_d ?? props.label;
  return name ? String(name) : null;
}

/** A GWR building near the point, tagged with the EGRID of the parcel it sits on. */
interface BuildingCandidate {
  egrid: string | null;
  address: string | null;
  plz: string | null;
  gemeinde: string | null;
}

/** Raw location candidates for a point — resolved against a parcel EGRID later. */
export interface LocationLookup {
  buildings: BuildingCandidate[];
  /** PLZ + place from the postal-code layer (works without a building). */
  plz: string | null;
  place: string | null;
  /** Municipality from the boundary layer (fallback). */
  gemeinde: string | null;
}

const str = (value: unknown): string | null => {
  const s = value == null ? '' : String(value).trim();
  return s.length > 0 ? s : null;
};

/**
 * Looks up location candidates for an LV95 point from three layers in parallel:
 *  - GWR building register (ch.bfs.gebaeude_wohnungs_register) — every building
 *    within tolerance, each tagged with the parcel EGRID it stands on.
 *  - PLZ/Ortschaften (ch.swisstopo-vd.ortschaftenverzeichnis_plz) — PLZ + place,
 *    works everywhere (also on fields without a building).
 *  - Municipality boundaries (…swissboundaries3d-gemeinde-flaeche.fill).
 *
 * The street address is *not* chosen here — see `resolveLocation`, which picks
 * the building that actually sits on the clicked parcel (by EGRID). Taking the
 * first GWR hit would return a neighbouring building's address on dense streets.
 */
export async function lookupLocation(
  easting: number,
  northing: number,
  signal?: AbortSignal
): Promise<LocationLookup> {
  const [gwr, plz, gde] = await Promise.allSettled([
    identify(
      easting,
      northing,
      { layer: 'ch.bfs.gebaeude_wohnungs_register', tolerance: 30 },
      signal
    ),
    identify(
      easting,
      northing,
      { layer: 'ch.swisstopo-vd.ortschaftenverzeichnis_plz', tolerance: 0 },
      signal
    ),
    identify(
      easting,
      northing,
      { layer: 'ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill', tolerance: 0 },
      signal
    ),
  ]);

  const buildings: BuildingCandidate[] =
    gwr.status === 'fulfilled'
      ? gwr.value.map((feature) => {
          const props = feature.properties ?? {};
          return {
            egrid: str(props.egrid),
            address: str(props.strname_deinr),
            // GWR stores PLZ as "6300/630000" — keep the leading 4-digit code.
            plz: str(props.plz_plz6)?.split('/')[0] ?? null,
            gemeinde: str(props.ggdename),
          };
        })
      : [];

  const plzProps =
    plz.status === 'fulfilled' ? plz.value[0]?.properties ?? null : null;
  // Pick the current political municipality (the layer also returns lake shares
  // and historical versions).
  const gdeProps =
    gde.status === 'fulfilled'
      ? (gde.value.find(
          (f) => f.properties?.objektart_lookup === 'politische_gemeinde'
        )?.properties ?? null)
      : null;

  return {
    buildings,
    plz: str(plzProps?.plz),
    place: str(plzProps?.langtext),
    gemeinde: str(gdeProps?.gemname),
  };
}

/**
 * Resolves the final location for a parcel: the street address comes only from
 * a building whose EGRID matches the clicked parcel (none → no address, e.g. for
 * undeveloped land); PLZ/place/municipality fall back to the area layers.
 */
export function resolveLocation(
  lookup: LocationLookup,
  parcelEgrid: string | null
): LocationInfo {
  const building =
    parcelEgrid && parcelEgrid.startsWith('CH')
      ? lookup.buildings.find((b) => b.egrid === parcelEgrid) ?? null
      : null;
  return {
    address: building?.address ?? null,
    plz: building?.plz ?? lookup.plz,
    place: lookup.place,
    gemeinde: building?.gemeinde ?? lookup.gemeinde,
  };
}

/** A GWR building returned by an area (bounding-box) query. */
export interface GwrBuilding {
  egrid: string;
  /** Parcel number (Liegenschaft). */
  number: string;
  address: string | null;
  /** Year of construction, if recorded. */
  baujahr: number | null;
  /** Building coordinates in LV95. */
  easting: number;
  northing: number;
}

/**
 * All GWR buildings within an LV95 bounding box `[xmin, ymin, xmax, ymax]`.
 * The geo.admin identify endpoint caps the result (≈200), so for large areas
 * this is not exhaustive — callers should surface that.
 */
export async function gwrBuildingsInBbox(
  bbox: [number, number, number, number],
  signal?: AbortSignal
): Promise<GwrBuilding[]> {
  const [xmin, ymin, xmax, ymax] = bbox;
  const params = new URLSearchParams({
    geometry: `${xmin},${ymin},${xmax},${ymax}`,
    geometryType: 'esriGeometryEnvelope',
    // geojson format so each feature exposes `properties` (egrid, gkode, …);
    // without it the API returns Esri `attributes` and properties is empty.
    geometryFormat: 'geojson',
    layers: 'all:ch.bfs.gebaeude_wohnungs_register',
    returnGeometry: 'false',
    tolerance: '0',
    sr: '2056',
    lang: 'de',
    limit: '200',
  });
  const res = await fetch(`${IDENTIFY_URL}?${params}`, { signal });
  if (!res.ok) throw new Error(`GWR-Abfrage fehlgeschlagen (HTTP ${res.status})`);
  const data = await res.json();
  return ((data.results ?? []) as IdentifyFeature[])
    .map((feature): GwrBuilding => {
      const props = feature.properties ?? {};
      const year = Number(props.gbauj);
      return {
        egrid: str(props.egrid) ?? '',
        number: str(props.lparz) ?? '',
        address: str(props.strname_deinr),
        baujahr: Number.isFinite(year) && year > 0 ? year : null,
        easting: Number(props.gkode) || 0,
        northing: Number(props.gkodn) || 0,
      };
    })
    .filter((b) => b.egrid && b.easting > 0);
}

export type DenkmalCheckResult = 'clear' | 'isos' | 'kgs' | 'both';

/**
 * Checks the ISOS (protected townscapes) and KGS (cultural property)
 * inventories in parallel. tolerance=5 catches parcels on the edge of
 * protected zone polygons.
 */
export async function checkDenkmalschutz(
  easting: number,
  northing: number,
  signal?: AbortSignal
): Promise<DenkmalCheckResult> {
  const [isos, kgs] = await Promise.all([
    identify(
      easting,
      northing,
      { layer: 'ch.bak.bundesinventar-schuetzenswerte-ortsbilder', tolerance: 5 },
      signal
    ),
    identify(easting, northing, { layer: 'ch.babs.kulturgueter', tolerance: 5 }, signal),
  ]);
  const hasIsos = isos.length > 0;
  const hasKgs = kgs.length > 0;
  if (hasIsos && hasKgs) return 'both';
  if (hasIsos) return 'isos';
  if (hasKgs) return 'kgs';
  return 'clear';
}
