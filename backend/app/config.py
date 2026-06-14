"""
Shared constants for the Swiss Parcel Quick-Check backend.

This module centralises every "magic" string used across the backend so that the
geo.admin.ch endpoint URLs, the cantonal OEREB service directory and the Swiss
LV95 projection definition live in exactly one place. Keeping these identical to
the values used by the original frontend (lib/geoAdmin.ts and lib/oereb.ts)
guarantees that the backend returns byte-for-byte compatible coordinates and
links.
"""

from typing import Dict

# --------------------------------------------------------------------------- #
# geo.admin.ch REST API endpoints
# --------------------------------------------------------------------------- #

# The SearchServer powers the address / parcel / municipality / postal-code
# autocomplete search ([A] GET /api/search).
SEARCH_URL = "https://api3.geo.admin.ch/rest/services/api/SearchServer"

# The MapServer "identify" endpoint returns the features of a given layer at a
# point or within an envelope. It is the workhorse behind the parcel, zone,
# location, Denkmalschutz and area-search lookups.
IDENTIFY_URL = "https://api3.geo.admin.ch/rest/services/all/MapServer/identify"

# --------------------------------------------------------------------------- #
# LV95 (EPSG:2056) projection definition
# --------------------------------------------------------------------------- #

# proj4 string for the Swiss LV95 grid (EPSG:2056). This MUST stay byte-for-byte
# identical to the definition registered in the frontend (lib/coordinates.ts) so
# that eastings/northings produced here match the ones the browser computed
# before. It describes the oblique Mercator ("somerc") projection used by
# swisstopo, anchored at the old Bern observatory (lat_0 / lon_0), with the
# false origin at (2'600'000, 1'200'000) and the Bessel ellipsoid plus the
# official 7 parameter datum shift to WGS84 (the +towgs84 values).
LV95_PROJ4 = (
    "+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 "
    "+x_0=2600000 +y_0=1200000 +ellps=bessel "
    "+towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs"
)

# --------------------------------------------------------------------------- #
# Cantonal OEREB (public-law restrictions cadastre) webservices
# --------------------------------------------------------------------------- #

# Each canton runs its own OEREB service implementing the standardized federal
# interface. An official PDF extract is available at
# {base}/extract/pdf?EGRID=<egrid> and a machine-readable JSON extract at
# {base}/extract/json?GEOMETRY=false&EGRID=<egrid>.
#
# Base URLs come from the official directory:
# https://www.cadastre.ch/de/oereb-webservice
# Cantons without a published standard service URL (e.g. BE, LU, NE, UR, VD, VS)
# are intentionally omitted: the OEREB button / exact zone is simply unavailable
# for parcels there. This dict is copied verbatim from lib/oereb.ts.
OEREB_SERVICES: Dict[str, str] = {
    "AG": "https://api.geo.ag.ch/v2/oereb",
    "AI": "https://oereb.ai.ch/ktai/wsgi/oereb",
    "AR": "https://oereb.ar.ch/ktar/wsgi/oereb",
    "BL": "https://oereb.geo.bl.ch",
    "BS": "https://api.oereb.bs.ch",
    "FR": "https://maps.fr.ch/RDPPF_ws/RdppfSVC.svc",
    "GE": "https://ge.ch/terecadastrews/RdppfSVC.svc",
    "GL": "https://map.geo.gl.ch/oereb",
    "GR": "https://oereb.geo.gr.ch/oereb",
    "JU": "https://geo.jura.ch/crdppf_server",
    "NW": "https://oereb.gis-daten.ch/oereb",
    "OW": "https://oereb.gis-daten.ch/oereb",
    "SG": "https://oereb.geo.sg.ch/ktsg/wsgi/oereb",
    "SH": "https://oereb.geo.sh.ch",
    "SO": "https://geo.so.ch/api/oereb",
    "SZ": "https://map.geo.sz.ch/oereb",
    "TG": "https://map.geo.tg.ch/services/oereb",
    "TI": "https://crdpp.geo.ti.ch/oereb2",
    "ZG": "https://oereb.zg.ch/ors",
    "ZH": "https://maps.zh.ch/oereb/v2",
}
