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
