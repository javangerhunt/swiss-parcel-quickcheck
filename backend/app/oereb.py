"""
OEREB (public-law restrictions cadastre) helpers.

Two things live here:

  * oereb_pdf_url   : build the link to a parcel's official OEREB PDF extract.
  * fetch_exact_zones: query a cantonal OEREB JSON extract and distil it down to
    the precise land-use zone(s) the parcel lies in (e.g. "Wohnzone 2" instead of
    the harmonized "Wohnzonen"), together with each zone's area share.

Every canton runs its own OEREB service (see config.OEREB_SERVICES). The JSON
structure varies slightly between cantons, so fetch_exact_zones searches the
whole document recursively for the relevant restriction objects rather than
relying on a fixed path.
"""

import re
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import httpx

from .config import OEREB_SERVICES

# The OEREB JSON extract can be slow to generate, so it gets a longer timeout
# than the geo.admin.ch calls.
OEREB_TIMEOUT = 30.0


def oereb_pdf_url(canton: str, egrid: str) -> Optional[str]:
    """
    Build the URL of the official OEREB PDF extract for a parcel.

    Params:
      canton: two-letter canton code (e.g. "ZH").
      egrid:  the parcel's EGRID (must start with "CH" to be valid).

    Returns:
      The PDF extract URL, or None when the canton has no published service or
      the EGRID is not a real federal id.
    """
    base = OEREB_SERVICES.get(canton)
    if not base or not egrid.startswith("CH"):
        return None
    # url-encode the EGRID so it is safe as a query parameter value.
    return base + "/extract/pdf?EGRID=" + quote(egrid, safe="")


def _german_text(value: Any) -> Optional[str]:
    """
    Pick the German text out of an OEREB multilingual field.

    OEREB's LegendText (and similar fields) is either a plain string or a list of
    {"Language": ..., "Text": ...} entries. We return the string as-is, or the
    Text of the entry whose Language is "de", or failing that the first entry's
    Text.

    Params:
      value: a string, or a list of {Language, Text} dicts.

    Returns:
      The German (or fallback) text, or None when nothing usable is present.
    """
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        entry: Optional[Dict[str, Any]] = None
        # Prefer the explicit German entry.
        for v in value:
            if isinstance(v, dict) and v.get("Language") == "de":
                entry = v
                break
        # Otherwise fall back to the first entry.
        if entry is None and value:
            first = value[0]
            entry = first if isinstance(first, dict) else None
        if entry is not None:
            return entry.get("Text")
    return None


def _collect_nutzungsplanung(node: Any, found: List[Dict[str, Any]]) -> None:
    """
    Recursively collect Nutzungsplanung (land-use plan) restriction entries.

    Walks the entire decoded JSON (dicts and lists). Whenever it meets an object
    whose Theme.Code contains the substring "Nutzungsplanung" and that has a
    truthy LegendText, it records a {text, area, type_code} entry. It always
    recurses into every dict value and list item so that nested structures are
    fully searched regardless of the canton's exact layout.

    Params:
      node:  the current JSON node (dict, list, or scalar).
      found: the accumulator list that collected entries are appended to.

    Returns:
      None (results are accumulated into `found`).
    """
    if isinstance(node, list):
        for item in node:
            _collect_nutzungsplanung(item, found)
        return
    if isinstance(node, dict):
        theme = node.get("Theme")
        theme_code = theme.get("Code") if isinstance(theme, dict) else None
        legend = node.get("LegendText")
        if (
            isinstance(theme_code, str)
            and "Nutzungsplanung" in theme_code
            and legend
        ):
            text = _german_text(legend)
            if text:
                area_share = node.get("AreaShare")
                found.append(
                    {
                        "text": text,
                        # AreaShare is the share of the parcel covered by this
                        # restriction; default to 0 when it is missing/non-numeric.
                        "area": area_share
                        if isinstance(area_share, (int, float))
                        and not isinstance(area_share, bool)
                        else 0,
                        # TypeCode distinguishes Grundnutzung (1-4) from overlays (5-9).
                        "type_code": ""
                        if node.get("TypeCode") is None
                        else str(node.get("TypeCode")),
                    }
                )
        # Recurse into every value so nested objects are searched too.
        for value in node.values():
            _collect_nutzungsplanung(value, found)


async def fetch_exact_zones(canton: str, egrid: str) -> Dict[str, Any]:
    """
    Fetch the precise cantonal land-use zone(s) for a parcel from OEREB.

    Returns the harmonized-but-precise zone designations (e.g. "Wohnzone 2") and
    each zone's percentage share of the parcel, ordered largest first. The result
    is shaped for the /api/exact-zone endpoint: {available, zones}.

    Availability and resilience:
      * available is False when the canton has no service or the EGRID is not a
        federal id ("CH..."); in that case zones is [].
      * any HTTP error or exception while fetching/parsing degrades to
        {available: True, zones: []} rather than raising.

    Filtering logic (mirrors the frontend):
      * Collect every Nutzungsplanung restriction with a LegendText.
      * If any entry reports an area, keep only those with area > 0 (drops legend
        entries that carry no parcel share); otherwise keep all entries.
      * Exclude overlay festlegungen whose TypeCode starts with 5-9
        (archaeological zone, Ortsbildschutzzone, Gefahrenzone, Bebauungsplan...),
        keeping only the Grundnutzung base zones (TypeCode 1-4).
      * Sum the area per zone designation, sort descending, and express each as a
        percentage of the total (or null when no areas are reported).

    Params:
      canton: two-letter canton code.
      egrid:  the parcel's EGRID.

    Returns:
      A dict {"available": bool, "zones": [{"zone": str, "percent": int|None}]}.
    """
    base = OEREB_SERVICES.get(canton)
    available = base is not None and egrid.startswith("CH")
    if not available:
        return {"available": False, "zones": []}

    # From here on the canton is "available"; any failure yields empty zones.
    try:
        url = "{}/extract/json?GEOMETRY=false&EGRID={}".format(
            base, quote(egrid, safe="")
        )
        async with httpx.AsyncClient(timeout=OEREB_TIMEOUT) as client:
            res = await client.get(url, headers={"Accept": "application/json"})
        if res.status_code != 200:
            return {"available": True, "zones": []}
        data = res.json()
    except Exception:
        # Network error, timeout, invalid JSON, etc. -> just report no zones.
        return {"available": True, "zones": []}

    # Recursively gather all Nutzungsplanung entries from the document.
    found: List[Dict[str, Any]] = []
    _collect_nutzungsplanung(data, found)

    # area > 0 drops map-legend rows that carry no parcel share; if no entry has
    # an area we keep them all (some services omit AreaShare entirely).
    has_areas = any(f["area"] > 0 for f in found)
    candidate = [f for f in found if f["area"] > 0] if has_areas else found

    # TypeCode 1-4 = Grundnutzung (base zones we want); 5-9 = overlays to exclude.
    relevant = [f for f in candidate if not re.match(r"^[5-9]", f["type_code"])]

    # Sum the area per distinct zone designation.
    by_text: Dict[str, float] = {}
    for entry in relevant:
        by_text[entry["text"]] = by_text.get(entry["text"], 0) + entry["area"]

    # Sort zones by total area, largest first.
    sorted_zones = sorted(by_text.items(), key=lambda kv: kv[1], reverse=True)
    total = sum(area for _, area in sorted_zones)

    zones = [
        {
            "zone": text,
            # Percent share, or None when no areas were reported at all.
            "percent": round(area / total * 100)
            if (has_areas and total > 0)
            else None,
        }
        for text, area in sorted_zones
    ]
    return {"available": True, "zones": zones}
