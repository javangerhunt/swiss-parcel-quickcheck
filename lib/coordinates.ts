import proj4 from 'proj4';

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
