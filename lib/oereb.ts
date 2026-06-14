/**
 * Cantonal ÖREB-Kataster webservices (public-law restrictions cadastre).
 * Every canton runs its own service implementing the standardized federal
 * interface; an official PDF extract is available at
 * {base}/extract/pdf?EGRID=<egrid>.
 *
 * Base URLs from the official directory: https://www.cadastre.ch/de/oereb-webservice
 * Cantons without a published standard service URL (e.g. BE, LU, NE, UR, VD, VS)
 * are omitted — the button is hidden for parcels there.
 */
const OEREB_SERVICES: Record<string, string> = {
  AG: 'https://api.geo.ag.ch/v2/oereb',
  AI: 'https://oereb.ai.ch/ktai/wsgi/oereb',
  AR: 'https://oereb.ar.ch/ktar/wsgi/oereb',
  BL: 'https://oereb.geo.bl.ch',
  BS: 'https://api.oereb.bs.ch',
  FR: 'https://maps.fr.ch/RDPPF_ws/RdppfSVC.svc',
  GE: 'https://ge.ch/terecadastrews/RdppfSVC.svc',
  GL: 'https://map.geo.gl.ch/oereb',
  GR: 'https://oereb.geo.gr.ch/oereb',
  JU: 'https://geo.jura.ch/crdppf_server',
  NW: 'https://oereb.gis-daten.ch/oereb',
  OW: 'https://oereb.gis-daten.ch/oereb',
  SG: 'https://oereb.geo.sg.ch/ktsg/wsgi/oereb',
  SH: 'https://oereb.geo.sh.ch',
  SO: 'https://geo.so.ch/api/oereb',
  SZ: 'https://map.geo.sz.ch/oereb',
  TG: 'https://map.geo.tg.ch/services/oereb',
  TI: 'https://crdpp.geo.ti.ch/oereb2',
  ZG: 'https://oereb.zg.ch/ors',
  ZH: 'https://maps.zh.ch/oereb/v2',
};

/**
 * URL of the official ÖREB PDF extract for a parcel, or null when the
 * canton has no published standard service or the EGRID is missing.
 */
export function oerebPdfUrl(canton: string, egrid: string): string | null {
  const base = OEREB_SERVICES[canton];
  if (!base || !egrid.startsWith('CH')) return null;
  return `${base}/extract/pdf?EGRID=${encodeURIComponent(egrid)}`;
}

/** Whether the canton publishes a standard ÖREB webservice. */
export function hasOerebService(canton: string): boolean {
  return canton in OEREB_SERVICES;
}

/** Picks the German text from an ÖREB multilingual `[{Language, Text}]` field. */
function germanText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const entry =
      (value.find(
        (v) => typeof v === 'object' && v && (v as { Language?: string }).Language === 'de'
      ) as { Text?: string } | undefined) ?? (value[0] as { Text?: string } | undefined);
    return entry?.Text ?? null;
  }
  return null;
}

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
 * cadastre — e.g. "Wohnzone 2" instead of the harmonized "Wohnzonen" — together
 * with the share of the parcel each zone covers (from the ÖREB area shares).
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
  const base = OEREB_SERVICES[canton];
  if (!base || !egrid.startsWith('CH')) return null;
  try {
    const res = await fetch(
      `${base}/extract/json?GEOMETRY=false&EGRID=${encodeURIComponent(egrid)}`,
      { signal, headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();

    // Recursively collect land-use (Nutzungsplanung) restrictions; structure
    // varies slightly between cantonal services, so we search rather than rely
    // on a fixed path.
    const found: { text: string; area: number; typeCode: string }[] = [];
    const visit = (node: unknown) => {
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (node && typeof node === 'object') {
        const obj = node as Record<string, unknown>;
        const themeCode = (obj.Theme as { Code?: string } | undefined)?.Code;
        if (
          typeof themeCode === 'string' &&
          themeCode.includes('Nutzungsplanung') &&
          obj.LegendText
        ) {
          const text = germanText(obj.LegendText);
          if (text) {
            found.push({
              text,
              area: typeof obj.AreaShare === 'number' ? obj.AreaShare : 0,
              typeCode: obj.TypeCode == null ? '' : String(obj.TypeCode),
            });
          }
        }
        Object.values(obj).forEach(visit);
      }
    };
    visit(data);

    // Keep only the Grundnutzung (the Zonenplan base zones) that actually cover
    // area. Two filters:
    //  - area > 0 drops the map-legend entries that carry no parcel share.
    //  - TypeCode 1–4 = Grundnutzung; 5–9 = overlay festlegungen (archäologische
    //    Zone, Ortsbildschutzzone, Gefahrenzone, Bebauungsplan, …) which are not
    //    part of the simple Zonenplan, so they are excluded.
    const hasAreas = found.some((f) => f.area > 0);
    const relevant = (hasAreas ? found.filter((f) => f.area > 0) : found).filter(
      (f) => !/^[5-9]/.test(f.typeCode)
    );

    // Sum area per actual zone designation (e.g. "Wohnzone 2", "Kernzone",
    // "Wohn- und Arbeitszone"), largest first.
    const byText = new Map<string, number>();
    for (const { text, area } of relevant) {
      byText.set(text, (byText.get(text) ?? 0) + area);
    }
    const sorted = Array.from(byText.entries()).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((sum, [, area]) => sum + area, 0);

    const zones: ExactZone[] = sorted.map(([zone, area]) => ({
      zone,
      percent: hasAreas && total > 0 ? Math.round((area / total) * 100) : null,
    }));
    return zones.length > 0 ? zones : null;
  } catch {
    return null;
  }
}
