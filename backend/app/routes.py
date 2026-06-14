"""
HTTP route definitions for the Swiss Parcel Quick-Check API.

This module declares one FastAPI APIRouter (mounted under the /api prefix by
main.py) with the five GET endpoints the frontend calls:

  [A] GET /api/search          : address / parcel / place search.
  [B] GET /api/parcel          : full parcel info for a WGS84 point.
  [C] GET /api/denkmalschutz   : heritage-protection check for an LV95 point.
  [D] GET /api/exact-zone      : precise cantonal land-use zones from OEREB.
  [E] GET /api/area-search     : parcels with buildings inside a bbox + filters.

Each handler keeps its own logic thin: it delegates the real work to the
geoadmin / oereb / area_search modules and only translates results and upstream
failures into HTTP responses. Upstream (geo.admin.ch) failures on the required
calls become HTTP 502 so the frontend can show a clear error.
"""

import asyncio
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from .area_search import search_area
from .coordinates import (
    planar_area_m2,
    reproject_geometry,
    wgs84_to_lv95,
)
from .geoadmin import (
    check_denkmalschutz,
    identify_parcel,
    identify_zone,
    lookup_location,
    resolve_location,
    search_locations,
)
from .oereb import fetch_exact_zones, oereb_pdf_url
from .schemas import (
    AreaSearchResponse,
    DenkmalResponse,
    ExactZoneResponse,
    ParcelResponse,
    SearchResult,
)

# All endpoints live under the /api prefix; next.config rewrites /api/* here.
router = APIRouter(prefix="/api")


@router.get("/search", response_model=List[SearchResult])
async def search(q: str = Query(..., description="Free-text search string")):
    """
    [A] Address / parcel / municipality / postal-code search.

    Params:
      q: the user's search text (query parameter).

    Returns:
      A JSON array of SearchResult.

    Raises:
      HTTPException 502 if the upstream SearchServer returns a non-200 status.
    """
    try:
        return await search_locations(q)
    except Exception as exc:
        # search_locations raises with the upstream HTTP status in its message.
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/parcel", response_model=ParcelResponse)
async def parcel(
    lat: float = Query(..., description="WGS84 latitude"),
    lon: float = Query(..., description="WGS84 longitude"),
):
    """
    [B] Full parcel info for a WGS84 point.

    Converts the point to LV95, then runs the required parcel identify together
    with three optional lookups (zone, location, none-fatal) concurrently. A
    failure of an optional lookup degrades to null; only a failure of the
    required parcel identify becomes an error.

    Params:
      lat: WGS84 latitude (query parameter).
      lon: WGS84 longitude (query parameter).

    Returns:
      A ParcelResponse. When no parcel exists at the point, returns {found: false}.

    Raises:
      HTTPException 502 if the required parcel identify network call fails.
    """
    easting, northing = wgs84_to_lv95(lat, lon)

    # Run the parcel (required), zone (optional) and location (optional) lookups
    # in parallel. return_exceptions=True keeps one optional failure from
    # cancelling the others; we inspect the parcel result explicitly below.
    parcel_res, zone_res, location_res = await asyncio.gather(
        identify_parcel(easting, northing),
        identify_zone(easting, northing),
        lookup_location(easting, northing),
        return_exceptions=True,
    )

    # The parcel identify is REQUIRED: if the network call itself failed, 502.
    if isinstance(parcel_res, Exception):
        raise HTTPException(status_code=502, detail=str(parcel_res))

    # No parcel at this point -> the contract says respond exactly {found: false}.
    # Returning a JSONResponse bypasses the response_model's field-filling so the
    # body is the bare {"found": false} object, not a dict padded with nulls.
    if parcel_res is None:
        return JSONResponse(content={"found": False})

    number = parcel_res["number"]
    egrid = parcel_res["egrid"]
    canton = parcel_res["canton"]
    geometry = parcel_res["geometry"]

    # Optional zone: degrade a failure (Exception) to None.
    zone: Optional[str] = None if isinstance(zone_res, Exception) else zone_res

    # Optional location: resolve the address by matching the parcel EGRID.
    if isinstance(location_res, Exception):
        location = {"address": None, "plz": None, "place": None, "gemeinde": None}
    else:
        location = resolve_location(location_res, egrid)

    # egrid_final falls back to "<canton>-<number>" when there is no real EGRID.
    egrid_final = egrid if egrid else (canton + "-" + number)
    # label prefers the human-friendly "Parzelle <n> (<canton>)" form.
    label = (
        "Parzelle " + number + " (" + canton + ")" if number else egrid_final
    )
    area_m2 = round(planar_area_m2(geometry)) if geometry else 0
    geometry_wgs84 = reproject_geometry(geometry) if geometry else None
    oereb_url = oereb_pdf_url(canton, egrid_final)

    return {
        "found": True,
        "egrid": egrid_final,
        "number": number,
        "canton": canton,
        "label": label,
        "areaM2": area_m2,
        "geoportalUrl": parcel_res["geoportalUrl"],
        "geometryWgs84": geometry_wgs84,
        "address": location["address"],
        "plz": location["plz"],
        "place": location["place"],
        "gemeinde": location["gemeinde"],
        "zone": zone,
        "oerebPdfUrl": oereb_url,
        "lat": lat,
        "lon": lon,
        "lv95": [easting, northing],
    }


@router.get("/denkmalschutz", response_model=DenkmalResponse)
async def denkmalschutz(
    easting: float = Query(..., description="LV95 easting"),
    northing: float = Query(..., description="LV95 northing"),
):
    """
    [C] Heritage-protection check (ISOS + KGS) for an LV95 point.

    Params:
      easting:  LV95 easting (query parameter).
      northing: LV95 northing (query parameter).

    Returns:
      A DenkmalResponse with status in {'clear', 'isos', 'kgs', 'both'}.

    Raises:
      HTTPException 502 if either upstream identify fails.
    """
    try:
        status = await check_denkmalschutz(easting, northing)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {"status": status}


@router.get("/exact-zone", response_model=ExactZoneResponse)
async def exact_zone(
    canton: str = Query(..., description="Two-letter canton code"),
    egrid: str = Query(..., description="Parcel EGRID"),
):
    """
    [D] Precise cantonal land-use zones for a parcel from the OEREB cadastre.

    fetch_exact_zones is self-contained and resilient: it never raises for a
    network/parse problem (it returns {available, zones: []} instead), so this
    handler simply forwards its result.

    Params:
      canton: two-letter canton code (query parameter).
      egrid:  the parcel's EGRID (query parameter).

    Returns:
      An ExactZoneResponse {available, zones}.
    """
    return await fetch_exact_zones(canton, egrid)


@router.get("/area-search", response_model=AreaSearchResponse)
async def area_search(
    xmin: float = Query(..., description="LV95 bbox xmin"),
    ymin: float = Query(..., description="LV95 bbox ymin"),
    xmax: float = Query(..., description="LV95 bbox xmax"),
    ymax: float = Query(..., description="LV95 bbox ymax"),
    zone: Optional[str] = Query(None, description="Harmonized zone substring"),
    minM2: Optional[int] = Query(None, description="Minimum area in m2"),
    maxM2: Optional[int] = Query(None, description="Maximum area in m2"),
    minYear: Optional[int] = Query(None, description="Minimum construction year"),
    maxYear: Optional[int] = Query(None, description="Maximum construction year"),
):
    """
    [E] Find parcels (with buildings) inside a bbox and apply filters.

    The four bbox coordinates are required floats; the remaining filters are
    optional. Delegates the orchestration to area_search.search_area.

    Params:
      xmin, ymin, xmax, ymax: LV95 bounding box (required query parameters).
      zone:    optional harmonized zone substring (case-insensitive).
      minM2:   optional minimum parcel area.
      maxM2:   optional maximum parcel area.
      minYear: optional minimum construction year.
      maxYear: optional maximum construction year.

    Returns:
      An AreaSearchResponse {results, scanned, capped}.

    Raises:
      HTTPException 502 if the required GWR bbox identify fails.
    """
    try:
        return await search_area(
            (xmin, ymin, xmax, ymax),
            zone,
            minM2,
            maxM2,
            minYear,
            maxYear,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
