"""
Swiss Parcel Quick-Check FastAPI backend package.

This package contains the Python backend that performs all external-API and
data-processing logic for the Swiss Parcel Quick-Check web app. The existing
Next.js / React / Leaflet frontend no longer calls api3.geo.admin.ch directly:
instead it calls this backend, which proxies and post-processes the geo.admin.ch
SearchServer, the MapServer "identify" endpoint, and the cantonal OEREB
(public-law restrictions cadastre) webservices.

Module overview:
  config.py      : shared constants (API URLs, OEREB service directory, proj4 string).
  coordinates.py : pyproj-based coordinate transforms, geometry reprojection, area.
  geoadmin.py    : async helpers that call the geo.admin.ch APIs.
  oereb.py       : OEREB PDF link builder and exact-zone JSON extraction.
  area_search.py : the bounding-box "area search" orchestration.
  schemas.py     : pydantic v2 response models (the JSON contract with the frontend).
  routes.py      : the FastAPI APIRouter wiring the 5 GET endpoints under /api.
  main.py        : the FastAPI application object (imported as `app`) with CORS.

The package targets Python 3.9, so all type hints use typing.Optional / List /
Dict / Tuple / Any rather than the newer "X | Y" union syntax.
"""
