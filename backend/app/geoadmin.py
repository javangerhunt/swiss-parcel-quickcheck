"""
Async client helpers for the geo.admin.ch REST APIs.

This module is the data-access layer of the backend. It wraps the two
geo.admin.ch endpoints (the SearchServer and the MapServer "identify" service)
behind small, well-typed async helper functions that the route handlers call.

Everything here is built on a single shared httpx.AsyncClient (created lazily by
get_client) so that connections are pooled across requests. The optional lookups
(zone, location, Denkmalschutz) are designed to degrade gracefully: a single
failing layer turns into null/empty rather than failing the whole request, which
mirrors the frontend's original Promise.allSettled behaviour.

All coordinates exchanged with geo.admin.ch are LV95 (EPSG:2056) eastings and
northings.
"""

import asyncio
import re
from typing import Any, Dict, List, Optional, Tuple

import httpx

from .config import IDENTIFY_URL, SEARCH_URL

# Default timeout for the geo.admin.ch calls. 20 seconds is generous but keeps a
# stuck upstream from hanging the request forever.
DEFAULT_TIMEOUT = 20.0

# Module-level shared client. We create it lazily so that importing this module
# does not require a running event loop.
_client: Optional[httpx.AsyncClient] = None


def get_client() -> httpx.AsyncClient:
    """
    Return the process-wide shared httpx.AsyncClient, creating it on first use.

    Reusing one client lets httpx pool TCP connections and reuse them across the
    many parallel identify calls, which is much faster than opening a fresh
    connection per request.

    Returns:
      The shared httpx.AsyncClient instance.
    """
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=DEFAULT_TIMEOUT)
    return _client


async def close_client() -> None:
    """
    Close the shared client (called on application shutdown).

    Returns:
      None.
    """
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def _strip_html(value: str) -> str:
    """
    Remove every HTML tag from a string.

    The SearchServer returns labels with <b>...</b> highlighting around the
    matched substring; the regex deletes anything that looks like a tag (<...>).

    Params:
      value: the raw label string, possibly containing HTML tags.

    Returns:
      The label with all <...> tags removed.
    """
    return re.sub(r"<[^>]*>", "", value)


def _trim(value: Any) -> Optional[str]:
    """
    Normalise a raw property value to a trimmed non-empty string or None.

    Equivalent to the frontend's `str()` helper: stringify, strip whitespace, and
    return None when the result is empty so that "missing" fields are uniformly
    represented as None.

    Params:
      value: any value coming from a feature's properties.

    Returns:
      The trimmed string, or None if it is missing/empty.
    """
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def _str_or_empty(value: Any) -> str:
    """
    Stringify a value, mapping a missing/null value to an empty string.

    This mirrors the frontend's String(x ?? '') idiom: when geo.admin.ch returns
    an explicit JSON null for a field, we want "" rather than the literal text
    "None" that str(None) would produce. Without this, a parcel with a null
    number/EGRID would surface as "Parzelle None (None)" and a bogus EGRID.

    Params:
      value: any property value (possibly None).

    Returns:
      str(value), or "" when value is None.
    """
    return str(value) if value is not None else ""


async def identify_point(
    easting: float,
    northing: float,
    layer: str,
    return_geometry: bool = False,
    tolerance: int = 0,
) -> List[Dict[str, Any]]:
    """
    Generic "identify" call against a geo.admin.ch layer at an LV95 point.

    The mapExtent and imageDisplay parameters are sized so that one pixel equals
    one metre: a 100 m wide extent (easting +/- 50) shown on a 100 px wide image.
    This 1px == 1m trick makes the pixel `tolerance` behave as a tolerance in
    metres, so callers can pass, e.g., tolerance=30 to catch buildings within 30 m.

    Params:
      easting:         LV95 easting of the query point.
      northing:        LV95 northing of the query point.
      layer:           geo.admin.ch layer id to query (without the "all:" prefix).
      return_geometry: whether to ask the API to return feature geometries.
      tolerance:       search tolerance in metres (see the 1px==1m note above).

    Returns:
      The list of feature dicts from data["results"] (each with optional
      "geometry" in LV95 and "properties"), or an empty list when there are none.

    Raises:
      httpx.HTTPStatusError-like behaviour: on a non-200 upstream status this
      raises a RuntimeError so the caller can translate it into HTTP 502.
    """
    params = {
        "geometry": "{},{}".format(easting, northing),
        "geometryFormat": "geojson",
        "geometryType": "esriGeometryPoint",
        "layers": "all:{}".format(layer),
        # httpx serialises booleans as "true"/"false" already, but the contract
        # asks for explicit string values, so we pass strings directly.
        "returnGeometry": "true" if return_geometry else "false",
        "tolerance": str(tolerance),
        # 100 m wide extent centred on the point (the 1px==1m trick).
        "mapExtent": "{},{},{},{}".format(
            easting - 50, northing - 50, easting + 50, northing + 50
        ),
        "imageDisplay": "100,100,96",
        "sr": "2056",
        "lang": "de",
    }
    res = await get_client().get(IDENTIFY_URL, params=params)
    if res.status_code != 200:
        # Surface upstream failures so the route layer can answer HTTP 502.
        raise RuntimeError(
            "Abfrage {} fehlgeschlagen (HTTP {})".format(layer, res.status_code)
        )
    data = res.json()
    return data.get("results") or []


def _parse_box2d(box: str) -> Optional[List[float]]:
    """
    Parse a PostGIS-style "BOX(xmin ymin,xmax ymax)" string into a bbox list.

    The SearchServer returns the bounding box of municipalities / postal areas in
    this textual format (in LV95 because we request sr=2056). We extract the four
    floats with a regex.

    Params:
      box: a string like "BOX(2600000 1200000,2601000 1201000)".

    Returns:
      [xmin, ymin, xmax, ymax] as floats, or None if the string does not match.
    """
    m = re.match(r"BOX\(([-\d.]+) ([-\d.]+),([-\d.]+) ([-\d.]+)\)", box)
    if not m:
        return None
    return [float(m.group(1)), float(m.group(2)), float(m.group(3)), float(m.group(4))]


async def search_locations(query: str) -> List[Dict[str, Any]]:
    """
    Address / parcel / municipality / postal-code search via the SearchServer.

    Requests the four origins used by the app (address, parcel, gg25 Gemeinde,
    zipcode Ort) in LV95 (sr=2056) so that geom_st_box2d is an LV95 bounding box
    suitable for the area search. Each raw result is mapped to the SearchResult
    shape and results without numeric lat/lon are dropped.

    Params:
      query: the user's free-text search string.

    Returns:
      A list of plain dicts shaped like SearchResult (label, lat, lon, detail,
      origin, bbox).

    Raises:
      RuntimeError on a non-200 upstream status (the caller maps it to HTTP 502).
    """
    params = {
        "searchText": query,
        "type": "locations",
        "origins": "address,parcel,gg25,zipcode",
        "lang": "de",
        "limit": "12",
        "sr": "2056",
    }
    res = await get_client().get(SEARCH_URL, params=params)
    if res.status_code != 200:
        raise RuntimeError("Suche fehlgeschlagen (HTTP {})".format(res.status_code))
    data = res.json()

    results: List[Dict[str, Any]] = []
    for item in data.get("results") or []:
        attrs = item.get("attrs") or {}
        box = str(attrs.get("geom_st_box2d") or "")
        results.append(
            {
                # Strip the <b> highlight tags the SearchServer wraps around the match.
                "label": _strip_html(str(attrs.get("label") or "")),
                "lat": attrs.get("lat"),
                "lon": attrs.get("lon"),
                "detail": str(attrs.get("detail") or ""),
                "origin": str(attrs.get("origin") or ""),
                "bbox": _parse_box2d(box),
            }
        )

    # Keep only results whose lat and lon are real numbers (drop malformed rows).
    return [
        r
        for r in results
        if isinstance(r["lat"], (int, float)) and isinstance(r["lon"], (int, float))
    ]


async def identify_parcel(
    easting: float, northing: float
) -> Optional[Dict[str, Any]]:
    """
    Parcel lookup (number, EGRID, canton, geometry, Geoportal link) at a point.

    Queries the cadastral webmap layer with geometry so we get the parcel
    outline. Returns None when no parcel is found at the point.

    Params:
      easting:  LV95 easting of the point.
      northing: LV95 northing of the point.

    Returns:
      A dict with keys number, egrid, canton, geoportalUrl, geometry (LV95), or
      None if there is no parcel here.
    """
    results = await identify_point(
        easting,
        northing,
        layer="ch.kantone.cadastralwebmap-farbe",
        return_geometry=True,
        tolerance=0,
    )
    if not results:
        return None
    feature = results[0]
    props = feature.get("properties") or {}
    geoportal = props.get("geoportal_url")
    return {
        # _str_or_empty maps an explicit JSON null to "" (like String(x ?? '')),
        # so a parcel with a missing number/EGRID does not become "None".
        "number": _str_or_empty(props.get("number")),
        # egris_egrid is the federal parcel identifier (EGRID), e.g. "CH...".
        "egrid": _str_or_empty(props.get("egris_egrid")),
        "canton": _str_or_empty(props.get("ak")),
        "geoportalUrl": str(geoportal) if geoportal else None,
        # The geometry is in LV95; the route layer reprojects it for the map.
        "geometry": feature.get("geometry") or None,
    }


async def identify_zone(easting: float, northing: float) -> Optional[str]:
    """
    Harmonized planning zone at an LV95 point, or None if unavailable.

    Uses the harmonized building-zone layer ch.are.bauzonen (the older
    nutzungsplanung-grundnutzung layer is no longer queryable via identify).
    Returns the German zone category (ch_bez_d, e.g. "Wohnzonen"), falling back
    to the generic label.

    Params:
      easting:  LV95 easting of the point.
      northing: LV95 northing of the point.

    Returns:
      The zone name as a string, or None.
    """
    results = await identify_point(
        easting,
        northing,
        layer="ch.are.bauzonen",
        return_geometry=False,
        tolerance=0,
    )
    props = (results[0].get("properties") if results else None) or {}
    # Nullish (not falsy) fallback, matching the frontend's `ch_bez_d ?? label`:
    # an explicit null falls through to the generic label, but an empty-string
    # ch_bez_d is kept and then mapped to None by the truthiness check below.
    name = props.get("ch_bez_d")
    if name is None:
        name = props.get("label")
    return str(name) if name else None


async def lookup_location(easting: float, northing: float) -> Dict[str, Any]:
    """
    Look up location candidates for an LV95 point from three layers in parallel.

    The three layers are:
      * GWR building register (ch.bfs.gebaeude_wohnungs_register), tolerance 30 m:
        every nearby building, each tagged with the EGRID of the parcel it sits
        on. The street address is NOT chosen here (see resolve_location).
      * PLZ / Ortschaften (ch.swisstopo-vd.ortschaftenverzeichnis_plz): PLZ +
        place name, which works everywhere, including on undeveloped land.
      * Municipality boundaries (swissboundaries3d-gemeinde-flaeche.fill): the
        political municipality as a fallback.

    Each layer is wrapped so that an individual failure degrades to empty/None
    instead of failing the whole lookup (mirrors Promise.allSettled).

    Params:
      easting:  LV95 easting of the point.
      northing: LV95 northing of the point.

    Returns:
      A dict with keys: buildings (list of {egrid, address, plz, gemeinde}),
      plz, place, gemeinde.
    """
    # Run the three identifies concurrently; return_exceptions keeps one failure
    # from cancelling the others (the allSettled equivalent).
    gwr_res, plz_res, gde_res = await asyncio.gather(
        identify_point(
            easting, northing, layer="ch.bfs.gebaeude_wohnungs_register", tolerance=30
        ),
        identify_point(
            easting,
            northing,
            layer="ch.swisstopo-vd.ortschaftenverzeichnis_plz",
            tolerance=0,
        ),
        identify_point(
            easting,
            northing,
            layer="ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill",
            tolerance=0,
        ),
        return_exceptions=True,
    )

    # GWR buildings: only usable when the call succeeded (not an Exception).
    buildings: List[Dict[str, Optional[str]]] = []
    if not isinstance(gwr_res, Exception):
        for feature in gwr_res:
            props = feature.get("properties") or {}
            plz_plz6 = _trim(props.get("plz_plz6"))
            # GWR stores PLZ as "6300/630000"; keep the leading 4-digit code.
            plz = plz_plz6.split("/")[0] if plz_plz6 else None
            buildings.append(
                {
                    "egrid": _trim(props.get("egrid")),
                    "address": _trim(props.get("strname_deinr")),
                    "plz": plz,
                    "gemeinde": _trim(props.get("ggdename")),
                }
            )

    # PLZ / place: take the first feature's properties when the call succeeded.
    plz_props: Dict[str, Any] = {}
    if not isinstance(plz_res, Exception) and plz_res:
        plz_props = plz_res[0].get("properties") or {}

    # Municipality: pick the current political municipality (the layer also
    # returns lake shares and historical versions).
    gde_props: Dict[str, Any] = {}
    if not isinstance(gde_res, Exception):
        for feature in gde_res:
            props = feature.get("properties") or {}
            if props.get("objektart_lookup") == "politische_gemeinde":
                gde_props = props
                break

    return {
        "buildings": buildings,
        "plz": _trim(plz_props.get("plz")),
        "place": _trim(plz_props.get("langtext")),
        "gemeinde": _trim(gde_props.get("gemname")),
    }


def resolve_location(
    lookup: Dict[str, Any], parcel_egrid: Optional[str]
) -> Dict[str, Optional[str]]:
    """
    Resolve the final location for a parcel from the raw lookup candidates.

    The rationale for EGRID-matching: the street address must come ONLY from a
    building whose EGRID equals the clicked parcel's EGRID. On dense streets the
    nearest GWR hit could be a neighbouring building, so taking the first hit
    would show the wrong address. We only trust the EGRID match when the parcel
    EGRID is a real federal id (starts with "CH"); otherwise there is no address.
    PLZ / place / municipality fall back to the area layers when the matched
    building does not supply them.

    Params:
      lookup:       the dict returned by lookup_location.
      parcel_egrid: the clicked parcel's EGRID (may be None).

    Returns:
      A dict with keys address, plz, place, gemeinde.
    """
    building: Optional[Dict[str, Any]] = None
    if parcel_egrid and parcel_egrid.startswith("CH"):
        # Find the building that actually sits on the clicked parcel.
        for b in lookup.get("buildings", []):
            if b.get("egrid") == parcel_egrid:
                building = b
                break

    return {
        "address": (building.get("address") if building else None),
        "plz": (building.get("plz") if building else None) or lookup.get("plz"),
        "place": lookup.get("place"),
        "gemeinde": (building.get("gemeinde") if building else None)
        or lookup.get("gemeinde"),
    }


async def gwr_buildings_in_bbox(
    bbox: Tuple[float, float, float, float]
) -> List[Dict[str, Any]]:
    """
    All GWR buildings within an LV95 bounding box [xmin, ymin, xmax, ymax].

    Uses an envelope identify with the geojson format so each feature exposes
    `properties` (without it the API returns Esri-style `attributes` and
    `properties` is empty). The geo.admin identify endpoint caps the result at
    about 200 features, so for large areas this is not exhaustive: callers should
    surface that via the `capped` flag.

    Params:
      bbox: (xmin, ymin, xmax, ymax) envelope in LV95 metres.

    Returns:
      A list of dicts shaped like {egrid, number, address, baujahr, easting,
      northing}, filtered to those with a non-empty egrid and easting > 0.

    Raises:
      RuntimeError on a non-200 upstream status (mapped to HTTP 502 by caller).
    """
    xmin, ymin, xmax, ymax = bbox
    params = {
        "geometry": "{},{},{},{}".format(xmin, ymin, xmax, ymax),
        "geometryType": "esriGeometryEnvelope",
        # geojson format so each feature exposes `properties` (egrid, gkode, ...).
        "geometryFormat": "geojson",
        "layers": "all:ch.bfs.gebaeude_wohnungs_register",
        "returnGeometry": "false",
        "tolerance": "0",
        "sr": "2056",
        "lang": "de",
        "limit": "200",
    }
    res = await get_client().get(IDENTIFY_URL, params=params)
    if res.status_code != 200:
        raise RuntimeError(
            "GWR-Abfrage fehlgeschlagen (HTTP {})".format(res.status_code)
        )
    data = res.json()

    buildings: List[Dict[str, Any]] = []
    for feature in data.get("results") or []:
        props = feature.get("properties") or {}
        egrid = _trim(props.get("egrid"))
        # Skip features without a parcel EGRID right away.
        if not egrid:
            continue

        # Parse the construction year; keep it only when it is a finite year > 0.
        baujahr: Optional[int] = None
        raw_year = props.get("gbauj")
        try:
            year = float(raw_year)
            if year == year and year not in (float("inf"), float("-inf")) and year > 0:
                # year == year filters out NaN (NaN is never equal to itself).
                baujahr = int(year)
        except (TypeError, ValueError):
            baujahr = None

        # gkode / gkodn are the building's LV95 coordinates.
        try:
            easting = float(props.get("gkode")) or 0.0
        except (TypeError, ValueError):
            easting = 0.0
        try:
            northing = float(props.get("gkodn")) or 0.0
        except (TypeError, ValueError):
            northing = 0.0

        # Keep only buildings with a usable EGRID and a real easting.
        if easting > 0:
            buildings.append(
                {
                    "egrid": egrid,
                    # lparz is the parcel (Liegenschaft) number.
                    "number": _trim(props.get("lparz")) or "",
                    "address": _trim(props.get("strname_deinr")),
                    "baujahr": baujahr,
                    "easting": easting,
                    "northing": northing,
                }
            )
    return buildings


async def check_denkmalschutz(easting: float, northing: float) -> str:
    """
    Check the ISOS and KGS heritage inventories at an LV95 point, in parallel.

    ISOS = federal inventory of protected townscapes
    (ch.bak.bundesinventar-schuetzenswerte-ortsbilder). KGS = cultural-property
    protection inventory (ch.babs.kulturgueter). tolerance=5 catches parcels on
    the edge of a protected-zone polygon.

    Params:
      easting:  LV95 easting of the point.
      northing: LV95 northing of the point.

    Returns:
      One of 'both', 'isos', 'kgs', 'clear'.

    Raises:
      RuntimeError if either upstream identify fails (mapped to HTTP 502).
    """
    isos, kgs = await asyncio.gather(
        identify_point(
            easting,
            northing,
            layer="ch.bak.bundesinventar-schuetzenswerte-ortsbilder",
            tolerance=5,
        ),
        identify_point(easting, northing, layer="ch.babs.kulturgueter", tolerance=5),
    )
    has_isos = len(isos) > 0
    has_kgs = len(kgs) > 0
    if has_isos and has_kgs:
        return "both"
    if has_isos:
        return "isos"
    if has_kgs:
        return "kgs"
    return "clear"
