"""
Pydantic v2 response models: the JSON contract with the frontend.

These models define the exact shape (and camelCase field names) of every JSON
response the backend returns, matching the TypeScript interfaces the Next.js /
React frontend expects. FastAPI uses them both to serialise responses and to
document the API.

Notes for Python 3.9 compatibility:
  * all optional/composite types use typing.Optional / List / Tuple / Dict / Any
    instead of the newer "X | Y" union syntax,
  * geometry fields are typed as Dict[str, Any] (arbitrary GeoJSON), since their
    inner structure varies (Polygon / MultiPolygon / GeometryCollection).
"""

from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel


class SearchResult(BaseModel):
    """
    One entry returned by [A] GET /api/search.

    Fields:
      label:  human-readable label with all HTML highlight tags stripped.
      lat:    WGS84 latitude of the result.
      lon:    WGS84 longitude of the result.
      detail: extra descriptive text (may be empty).
      origin: result kind ('address' | 'parcel' | 'gg25' | 'zipcode').
      bbox:   LV95 bounding box [xmin, ymin, xmax, ymax] for area search, or None.
    """

    label: str
    lat: float
    lon: float
    detail: str
    origin: str
    bbox: Optional[Tuple[float, float, float, float]] = None


class ParcelResponse(BaseModel):
    """
    Response of [B] GET /api/parcel when a parcel is found.

    When no parcel is found at the point, the endpoint instead returns the bare
    object {"found": false} (so most fields here are optional / defaulted).

    Fields mirror the frontend's ParcelInfo plus the `found` flag, the harmonized
    `zone`, and the `oerebPdfUrl` link.
    """

    found: bool
    egrid: Optional[str] = None
    number: Optional[str] = None
    canton: Optional[str] = None
    label: Optional[str] = None
    areaM2: Optional[int] = None
    geoportalUrl: Optional[str] = None
    # Parcel outline reprojected to WGS84 for Leaflet, or None.
    geometryWgs84: Optional[Dict[str, Any]] = None
    address: Optional[str] = None
    plz: Optional[str] = None
    place: Optional[str] = None
    gemeinde: Optional[str] = None
    zone: Optional[str] = None
    oerebPdfUrl: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    # The clicked point in LV95 [easting, northing].
    lv95: Optional[Tuple[float, float]] = None


class DenkmalResponse(BaseModel):
    """
    Response of [C] GET /api/denkmalschutz.

    Fields:
      status: one of 'clear' | 'isos' | 'kgs' | 'both'.
    """

    status: str


class ExactZone(BaseModel):
    """
    One precise cantonal land-use zone from the OEREB cadastre.

    Fields:
      zone:    the zone designation (e.g. "Wohnzone 2").
      percent: the parcel's share of this zone in percent, or None when no area
               is reported.
    """

    zone: str
    percent: Optional[int] = None


class ExactZoneResponse(BaseModel):
    """
    Response of [D] GET /api/exact-zone.

    Fields:
      available: whether the canton publishes an OEREB service for this EGRID.
      zones:     the precise zones (possibly empty), largest share first.
    """

    available: bool
    zones: List[ExactZone]


class AreaResult(BaseModel):
    """
    One parcel returned by [E] GET /api/area-search.

    Fields:
      egrid:   the parcel's EGRID.
      number:  the parcel (Liegenschaft) number.
      address: a representative building address, or None.
      areaM2:  the parcel area in square metres.
      zone:    the harmonized zone category, or None.
      baujahr: the representative (newest) construction year, or None.
      lat:     WGS84 latitude of the parcel point.
      lon:     WGS84 longitude of the parcel point.
    """

    egrid: str
    number: str
    address: Optional[str] = None
    areaM2: int
    zone: Optional[str] = None
    baujahr: Optional[int] = None
    lat: float
    lon: float


class AreaSearchResponse(BaseModel):
    """
    Response of [E] GET /api/area-search.

    Fields:
      results: the matching parcels, sorted by area descending.
      scanned: distinct parcels (with a building) found before per-parcel filters.
      capped:  True if the GWR area query hit its result cap (area not fully covered).
    """

    results: List[AreaResult]
    scanned: int
    capped: bool
