import proj4 from 'proj4';
import type { Geometry, Position } from 'geojson';

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

type NestedCoords = Position | NestedCoords[];

function reprojectCoords(coords: NestedCoords): NestedCoords {
  if (typeof coords[0] === 'number') {
    const [easting, northing] = coords as Position;
    return proj4('EPSG:2056', 'EPSG:4326', [easting, northing]);
  }
  return (coords as NestedCoords[]).map(reprojectCoords);
}

/** Reproject a GeoJSON geometry from LV95 to WGS84 (for Leaflet display). */
export function geometryLv95ToWgs84<G extends Geometry>(geometry: G): G {
  if (geometry.type === 'GeometryCollection') {
    return {
      ...geometry,
      geometries: geometry.geometries.map(geometryLv95ToWgs84),
    };
  }
  return {
    ...geometry,
    coordinates: reprojectCoords(geometry.coordinates as NestedCoords),
  };
}

function ringArea(ring: Position[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum / 2);
}

/**
 * Planar (shoelace) area in m² for a geometry in a metric CRS such as LV95.
 * Outer rings count positive, holes are subtracted.
 */
export function planarAreaM2(geometry: Geometry): number {
  switch (geometry.type) {
    case 'Polygon': {
      const [outer, ...holes] = geometry.coordinates;
      return ringArea(outer) - holes.reduce((sum, hole) => sum + ringArea(hole), 0);
    }
    case 'MultiPolygon':
      return geometry.coordinates.reduce(
        (sum, poly) => sum + planarAreaM2({ type: 'Polygon', coordinates: poly }),
        0
      );
    case 'GeometryCollection':
      return geometry.geometries.reduce((sum, g) => sum + planarAreaM2(g), 0);
    default:
      return 0;
  }
}
