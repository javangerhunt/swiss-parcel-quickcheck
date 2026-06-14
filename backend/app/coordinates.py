"""
Coordinate transforms and geometry helpers for the Swiss LV95 grid.

The geo.admin.ch APIs work in LV95 (EPSG:2056) eastings/northings, while the
Leaflet map in the browser works in WGS84 latitude/longitude. This module wraps
pyproj to convert between the two coordinate systems and provides two pure
geometry utilities:

  * reproject_geometry : turn a whole GeoJSON geometry from LV95 into WGS84 so
    the frontend can draw the parcel outline on the map.
  * planar_area_m2     : compute a parcel's area in square metres directly from
    the LV95 (metric) coordinates using the shoelace formula.

The transformers are built once at import time from the proj4 string in
config.LV95_PROJ4, which is identical to the frontend's definition so that the
numbers match exactly.
"""

import os
import shutil
import tempfile
import warnings
from typing import Any, Dict, List, Tuple

# Importing pyproj initialises PROJ's global context, which registers its
# database directory. When the project lives under a path containing a colon
# (here ".../2025:2026/..."), PROJ misreads that colon as a path separator and
# emits "UserWarning: pyproj unable to set database path" at import time. The
# real fix is applied just below by _ensure_proj_data_dir(); here we only
# silence that one cosmetic import-time warning so the server starts cleanly.
with warnings.catch_warnings():
    warnings.simplefilter("ignore")
    import pyproj  # noqa: F401  (imported for its side effects / completeness)
    from pyproj import Transformer
    from pyproj import datadir as _pyproj_datadir

from .config import LV95_PROJ4


def _ensure_proj_data_dir() -> None:
    """
    Make sure PROJ can find its database even when the install path is "weird".

    PROJ treats its data-directory setting as a colon-separated search path (like
    the shell PATH). This project lives under a directory that contains a colon
    (".../2025:2026/..."), so the colon splits the path into nonexistent
    directories and PROJ fails with "no database context specified". The fix is
    to copy the bundled PROJ data (proj.db and friends) once into a cache folder
    whose path has no colon, and point pyproj at that copy before any Transformer
    is built.

    This runs at import time and is a no-op when the current data directory is
    already colon-free (the normal case on most machines).

    Returns:
      None.
    """
    try:
        current = _pyproj_datadir.get_data_dir()
    except Exception:
        current = None

    # Only intervene when the data directory is unusable because of a colon.
    if current and ":" not in current:
        return

    # Destination cache directory with a guaranteed colon-free path.
    cache_dir = os.path.join(tempfile.gettempdir(), "swiss_parcel_proj_data")
    proj_db = os.path.join(cache_dir, "proj.db")

    # Copy the bundled PROJ data the first time only.
    if not os.path.exists(proj_db) and current and os.path.isdir(current):
        os.makedirs(cache_dir, exist_ok=True)
        # Copy every file in the PROJ data directory (proj.db, grids, etc.).
        for name in os.listdir(current):
            src = os.path.join(current, name)
            if os.path.isfile(src):
                shutil.copy2(src, os.path.join(cache_dir, name))

    if os.path.exists(proj_db):
        _pyproj_datadir.set_data_dir(cache_dir)


# Repoint PROJ to a colon-free data directory if necessary (see the docstring),
# BEFORE building any Transformer below.
_ensure_proj_data_dir()

# --------------------------------------------------------------------------- #
# pyproj transformers (built once, reused for every request)
# --------------------------------------------------------------------------- #

# WGS84 (EPSG:4326) -> LV95 (the proj4 string). always_xy=True forces pyproj to
# use longitude/latitude (x, y) ordering instead of the CRS-native lat/lon, which
# matches how the frontend's proj4 library behaves.
_TO_LV95 = Transformer.from_crs("EPSG:4326", LV95_PROJ4, always_xy=True)

# The inverse transformer: LV95 -> WGS84. With always_xy=True it returns
# (longitude, latitude).
_TO_WGS84 = Transformer.from_crs(LV95_PROJ4, "EPSG:4326", always_xy=True)


def wgs84_to_lv95(lat: float, lon: float) -> Tuple[float, float]:
    """
    Convert WGS84 latitude/longitude to LV95 easting/northing.

    Because the transformer is always_xy (x first), we feed it (lon, lat) and it
    returns (easting, northing) directly.

    Params:
      lat: WGS84 latitude in decimal degrees.
      lon: WGS84 longitude in decimal degrees.

    Returns:
      (easting, northing) tuple in LV95 metres.
    """
    easting, northing = _TO_LV95.transform(lon, lat)
    return easting, northing


def lv95_to_wgs84(easting: float, northing: float) -> Tuple[float, float]:
    """
    Convert LV95 easting/northing to WGS84 latitude/longitude.

    The inverse transformer yields (lon, lat) because of always_xy ordering, so
    we swap the pair to return the (lat, lon) order the frontend expects.

    Params:
      easting:  LV95 easting in metres.
      northing: LV95 northing in metres.

    Returns:
      (lat, lon) tuple in decimal degrees.
    """
    lon, lat = _TO_WGS84.transform(easting, northing)
    return lat, lon


def _reproject_coords(coords: Any) -> Any:
    """
    Recursively reproject a (possibly deeply nested) GeoJSON coordinate array
    from LV95 to WGS84.

    A coordinate is a flat list whose first element is a number, e.g.
    [easting, northing]; anything else is a list of such coordinates (a ring, a
    polygon, a multipolygon, ...) and is mapped element by element. The result
    keeps GeoJSON ordering, i.e. each point becomes [lon, lat].

    Params:
      coords: either a [easting, northing] pair or an arbitrarily nested list of
              such pairs.

    Returns:
      The same structure with every coordinate pair converted to [lon, lat].
    """
    # Base case: a single coordinate pair where the first entry is a number.
    if coords and isinstance(coords[0], (int, float)):
        easting, northing = coords[0], coords[1]
        lat, lon = lv95_to_wgs84(easting, northing)
        # GeoJSON stores positions as [longitude, latitude].
        return [lon, lat]
    # Recursive case: a list of nested coordinate arrays.
    return [_reproject_coords(part) for part in coords]


def reproject_geometry(geometry: Dict[str, Any]) -> Dict[str, Any]:
    """
    Reproject a whole GeoJSON geometry from LV95 (EPSG:2056) to WGS84.

    Supports Polygon, MultiPolygon and GeometryCollection (recursing into its
    member geometries). Any other geometry type is returned with its coordinates
    reprojected generically via the nested-array walker.

    Params:
      geometry: a GeoJSON geometry dict with LV95 coordinates.

    Returns:
      A new GeoJSON geometry dict with WGS84 [lon, lat] coordinates.
    """
    geom_type = geometry.get("type")
    if geom_type == "GeometryCollection":
        # A GeometryCollection has no "coordinates"; recurse over its members.
        return {
            **geometry,
            "geometries": [
                reproject_geometry(g) for g in geometry.get("geometries", [])
            ],
        }
    # Polygon, MultiPolygon and any nested-coordinate geometry are handled by the
    # generic recursive coordinate reprojector.
    return {
        **geometry,
        "coordinates": _reproject_coords(geometry.get("coordinates", [])),
    }


def _ring_area(ring: List[List[float]]) -> float:
    """
    Shoelace area of a single linear ring given in metric (LV95) coordinates.

    The shoelace (surveyor's) formula sums the cross products of consecutive
    vertices: area = |sum_i (x_i * y_{i+1} - x_{i+1} * y_i)| / 2. We iterate to
    len(ring) - 1 because GeoJSON rings are closed (the last vertex repeats the
    first), so the final implicit edge is already covered.

    Params:
      ring: list of [x, y] coordinate pairs forming a closed ring.

    Returns:
      The (always non-negative) ring area in square metres.
    """
    total = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[i + 1][0], ring[i + 1][1]
        total += x1 * y2 - x2 * y1
    return abs(total) / 2


def planar_area_m2(geometry: Dict[str, Any]) -> float:
    """
    Planar (shoelace) area in square metres for a geometry in a metric CRS.

    Because LV95 is a metric projection, treating the coordinates as if they were
    on a flat plane is accurate enough for parcel-sized areas. Outer rings count
    positive and holes (inner rings) are subtracted.

    Handling per geometry type:
      * Polygon            : outer ring area minus the sum of the hole areas.
      * MultiPolygon       : sum of the areas of its polygons.
      * GeometryCollection : sum of the areas of its member geometries.
      * anything else      : 0 (points, lines, etc. have no area).

    Params:
      geometry: a GeoJSON geometry dict with LV95 coordinates.

    Returns:
      The area in square metres as a float.
    """
    geom_type = geometry.get("type")
    if geom_type == "Polygon":
        rings = geometry.get("coordinates", [])
        if not rings:
            return 0.0
        outer = rings[0]
        holes = rings[1:]
        return _ring_area(outer) - sum(_ring_area(hole) for hole in holes)
    if geom_type == "MultiPolygon":
        # Each element is the "coordinates" of a Polygon; reuse the Polygon path.
        return sum(
            planar_area_m2({"type": "Polygon", "coordinates": poly})
            for poly in geometry.get("coordinates", [])
        )
    if geom_type == "GeometryCollection":
        return sum(planar_area_m2(g) for g in geometry.get("geometries", []))
    # Points, lines and unknown types have no planar area.
    return 0.0
