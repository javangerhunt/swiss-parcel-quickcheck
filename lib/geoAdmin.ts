import type { Geometry } from 'geojson';
import type { SearchResult } from '@/types/parcel';

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
    origins: 'parcel,address',
    lang: 'de',
    limit: '10',
  });
  const res = await fetch(`${SEARCH_URL}?${params}`, { signal });
  if (!res.ok) throw new Error(`Suche fehlgeschlagen (HTTP ${res.status})`);
  const data = await res.json();
  const results: SearchResult[] = (data.results ?? []).map(
    (r: { attrs?: Record<string, unknown> }) => ({
      label: stripHtml(String(r.attrs?.label ?? '')),
      lat: r.attrs?.lat as number,
      lon: r.attrs?.lon as number,
      detail: String(r.attrs?.detail ?? ''),
      origin: String(r.attrs?.origin ?? ''),
    })
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
