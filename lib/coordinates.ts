/**
 * Client-side coordinate conversion between WGS84 (lat/lon, used by the Leaflet
 * map and GPS) and the Swiss LV95 grid (EPSG:2056, metric eastings/northings).
 *
 * Most coordinate work now runs in the Python backend (pyproj). This small module
 * stays in the browser only for the on-map measurement tool, which converts the
 * points you draw into metric LV95 so it can show live distances and areas as you
 * drag, without a round trip to the server.
 */
import proj4 from 'proj4';

// Register the Swiss LV95 projection (EPSG:2056) with proj4. This is the official
// Swiss oblique-Mercator ("somerc") definition: projection centre near Bern, a
// 2'600'000 / 1'200'000 false easting/northing, the Bessel 1841 ellipsoid, and the
// 3-parameter datum shift to WGS84. The exact same string is used in the backend,
// so both sides produce identical coordinates.
proj4.defs(
  'EPSG:2056',
  '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 ' +
    '+x_0=2600000 +y_0=1200000 +ellps=bessel ' +
    '+towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs'
);

/** WGS84 lat/lon -> LV95 [easting, northing] (EPSG:2056). */
export function wgs84ToLV95(lat: number, lon: number): [number, number] {
  const [easting, northing] = proj4('EPSG:4326', 'EPSG:2056', [lon, lat]);
  return [easting, northing];
}

/** LV95 easting/northing -> WGS84 [lat, lon]. */
export function lv95ToWgs84(easting: number, northing: number): [number, number] {
  const [lon, lat] = proj4('EPSG:2056', 'EPSG:4326', [easting, northing]);
  return [lat, lon];
}
