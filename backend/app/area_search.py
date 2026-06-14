"""
Bounding-box "area search" orchestration.

Given an LV95 bounding box (typically a municipality's or postal area's extent
from the SearchServer) and a set of filters, this module finds the parcels that
contain buildings, resolves each parcel's area and zone, and applies the user's
filters. It is the backend for the [E] GET /api/area-search endpoint.

The work is bounded twice for performance and to respect upstream limits:
  * the GWR envelope identify caps at about 200 buildings (the `capped` flag),
  * only the first 90 distinct parcels are looked up in detail
    (MAX_PARCEL_LOOKUPS), with at most 8 parcels resolved concurrently.
"""

import asyncio
from typing import Any, Dict, List, Optional, Tuple

from .coordinates import lv95_to_wgs84, planar_area_m2
from .geoadmin import gwr_buildings_in_bbox, identify_parcel, identify_zone

# The geo.admin identify endpoint caps an envelope query at roughly 200 features.
GWR_CAP = 200
# Bound the number of per-parcel area/zone lookups so a huge area stays fast.
MAX_PARCEL_LOOKUPS = 90
# Maximum number of parcels resolved at the same time (politeness + speed).
CONCURRENCY = 8


async def search_area(
    bbox: Tuple[float, float, float, float],
    zone: Optional[str],
    min_m2: Optional[int],
    max_m2: Optional[int],
    min_year: Optional[int],
    max_year: Optional[int],
) -> Dict[str, Any]:
    """
    Search a bounding box for parcels (with buildings) and resolve + filter them.

    Pipeline:
      1. Query all GWR buildings in the bbox; `capped` is True if the result hit
         the GWR cap (meaning the area is not fully covered).
      2. Dedupe buildings to parcels by EGRID, keeping the MAX construction year
         seen as the parcel's representative baujahr.
      3. Cheap year pre-filter (no extra network calls): drop parcels outside the
         min/max year window (a missing baujahr fails any active year filter).
      4. `scanned` = parcels after the year filter; then keep only the first 90.
      5. For each kept parcel, resolve its area (identify_parcel) and zone
         (identify_zone) in parallel, bounded to 8 concurrent parcels via a
         Semaphore. Per-parcel exceptions are swallowed (that parcel is skipped).
      6. Filter by min/max area and zone substring, then sort by area descending.

    Params:
      bbox:     (xmin, ymin, xmax, ymax) envelope in LV95 metres.
      zone:     optional harmonized zone substring to match (case-insensitive).
      min_m2:   optional minimum parcel area in square metres.
      max_m2:   optional maximum parcel area in square metres.
      min_year: optional minimum construction year.
      max_year: optional maximum construction year.

    Returns:
      A dict {"results": [AreaResult...], "scanned": int, "capped": bool}.
    """
    # Step 1: all GWR buildings in the box.
    buildings = await gwr_buildings_in_bbox(bbox)
    capped = len(buildings) >= GWR_CAP

    # Step 2: dedupe to parcels by EGRID, keeping the newest building year.
    by_parcel: Dict[str, Dict[str, Any]] = {}
    for b in buildings:
        egrid = b["egrid"]
        existing = by_parcel.get(egrid)
        if existing is None:
            # First building on this parcel: copy it as the representative.
            by_parcel[egrid] = dict(b)
        else:
            # Keep the maximum baujahr seen across the parcel's buildings.
            existing_year = existing["baujahr"] or 0
            new_year = b["baujahr"] or 0
            if new_year > existing_year:
                existing["baujahr"] = b["baujahr"]

    # Step 3: cheap year pre-filter before any per-parcel network calls.
    def passes_year(p: Dict[str, Any]) -> bool:
        """
        True if the parcel's construction year falls inside the requested
        min/max year window. A parcel with no recorded baujahr fails whenever a
        year bound is active.
        """
        baujahr = p["baujahr"]
        if min_year is not None and (baujahr is None or baujahr < min_year):
            return False
        if max_year is not None and (baujahr is None or baujahr > max_year):
            return False
        return True

    parcels = [p for p in by_parcel.values() if passes_year(p)]

    # Step 4: count what we scanned, then cap the expensive lookups.
    scanned = len(parcels)
    parcels = parcels[:MAX_PARCEL_LOOKUPS]

    # Step 5: resolve area + zone per parcel with bounded concurrency.
    semaphore = asyncio.Semaphore(CONCURRENCY)

    async def resolve(p: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Resolve one parcel's area + zone, or None on error."""
        async with semaphore:
            try:
                easting = p["easting"]
                northing = p["northing"]
                # Area (with geometry) and harmonized zone in parallel.
                parcel, zone_name = await asyncio.gather(
                    identify_parcel(easting, northing),
                    identify_zone(easting, northing),
                )
                lat, lon = lv95_to_wgs84(easting, northing)
                geometry = parcel.get("geometry") if parcel else None
                area_m2 = round(planar_area_m2(geometry)) if geometry else 0
                # Prefer the cadastral parcel number; fall back to the GWR lparz.
                number = (parcel.get("number") if parcel else "") or p["number"]
                return {
                    "egrid": p["egrid"],
                    "number": number,
                    "address": p["address"],
                    "areaM2": area_m2,
                    "zone": zone_name,
                    "baujahr": p["baujahr"],
                    "lat": lat,
                    "lon": lon,
                }
            except Exception:
                # A single bad parcel must not sink the whole area search.
                return None

    resolved = await asyncio.gather(*(resolve(p) for p in parcels))

    # Step 6: apply the post-resolution filters and sort by area descending.
    zone_lower = zone.lower() if zone else None
    results: List[Dict[str, Any]] = []
    for r in resolved:
        if r is None:
            continue
        if min_m2 is not None and r["areaM2"] < min_m2:
            continue
        if max_m2 is not None and r["areaM2"] > max_m2:
            continue
        if zone_lower is not None and zone_lower not in (r["zone"] or "").lower():
            continue
        results.append(r)

    results.sort(key=lambda r: r["areaM2"], reverse=True)
    return {"results": results, "scanned": scanned, "capped": capped}
