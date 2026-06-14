# Architecture: Swiss Parcel Quick-Check

This document is a guided walkthrough of the whole codebase, written for a reader
who knows programming but has never seen this project. It explains what each part
does, how a single click on the map flows through the system, and where every
source file lives. For how to install and run the app, see the top-level
[README.md](./README.md) and [backend/README.md](./backend/README.md).

A few domain terms appear throughout. They are defined here once:

- **EGRID**: the federal, Switzerland-wide unique identifier of a land parcel
  (always starts with "CH"), e.g. `CH807309024796`.
- **LV95** (EPSG:2056): the official Swiss metric coordinate grid. Coordinates
  are an easting and a northing in metres. The federal map APIs speak LV95.
- **WGS84** (EPSG:4326): the usual GPS latitude/longitude system. The browser map
  (Leaflet) speaks WGS84.
- **Gemeinde**: a Swiss municipality (the local political commune).
- **Bauzone**: a building/planning zone. The app shows the harmonized federal
  category (e.g. "Wohnzonen" = residential zones).
- **OEREB** (German: OEREB-Kataster): the cadastre of public-law restrictions on
  land ownership. Each canton runs its own OEREB webservice; it provides the
  precise land-use zone of a parcel and an official PDF extract.
- **ISOS**: the federal inventory of townscapes worthy of protection.
- **KGS**: the federal inventory of cultural property (listed monuments).
- **GWR**: the federal building and dwelling register (Gebaeude- und
  Wohnungsregister). Every building carries the EGRID of the parcel it stands on,
  plus an address and construction year (Baujahr).

---

## Overview

Swiss Parcel Quick-Check is a web app for researching Swiss land parcels. You see
an interactive map of Switzerland; you click a spot (or search for an address,
parcel number or EGRID), and the app instantly shows that parcel's planning zone,
its area in square metres, its EGRID, the municipality and address, and whether it
carries heritage-protection flags. You can record the owner of each parcel, save
parcels to a personal watchlist, compare them, and export the list as CSV or Excel.

The app is a **real full-stack split** with two parts that run side by side:

- a **Python FastAPI backend** (folder `backend/`) that owns all data logic: it
  calls the Swiss federal geo.admin.ch APIs and the cantonal OEREB services,
  converts coordinates between WGS84 and LV95, computes parcel areas, and returns
  ready-to-display JSON. It exposes five GET endpoints under `/api`.
- a **Next.js 14 + React + TypeScript frontend** (folders `app/`, `components/`,
  `hooks/`, `lib/`, `types/`) that renders the Leaflet map and the whole UI. The
  browser never calls geo.admin.ch directly; it calls the backend through a
  relative `/api` path that Next.js rewrites to the FastAPI server.

The only client-side coordinate maths that remains in the browser is `proj4`, used
purely by the on-map measurement tool. Everything on the data path runs in Python.

---

## System diagram

```
  +-------------------------------------------------------------+
  |                        Browser                              |
  |                                                             |
  |   Leaflet map (Map.tsx)   React UI (panels, search, ...)    |
  |        |  click                       |  fetch('/api/...')  |
  +--------|----------------------------- |--------------------+
           |                              |
           v                              v
       (user click reported up        relative /api request
        to page.tsx, which calls           |
        the lib/ API clients)              |
                                           v
                          +-----------------------------------+
                          |   Next.js dev server (port 3000)  |
                          |   next.config.mjs rewrites        |
                          |   /api/:path*  ->  backend        |
                          +-----------------|-----------------+
                                            | (proxy)
                                            v
                          +-----------------------------------+
                          |   FastAPI backend (port 8000)     |
                          |   routes.py  ->  geoadmin /       |
                          |   coordinates / oereb /           |
                          |   area_search                     |
                          +-----------------|-----------------+
                                            | httpx (async)
                                            v
                          +-----------------------------------+
                          |   Swiss federal APIs              |
                          |   geo.admin.ch SearchServer +     |
                          |   MapServer "identify"            |
                          |   cantonal OEREB webservices      |
                          +-----------------|-----------------+
                                            |
                                            v
                          JSON flows back up the same chain:
                          federal API -> backend (transform,
                          reproject, compute area) -> Next.js
                          rewrite -> browser -> panel renders.
```

---

## Request lifecycle: "the user clicks a parcel on the map"

This is the central interaction. Here is exactly what happens, in order, naming
the real files and functions.

1. **`components/Map.tsx`** is the Leaflet map. A plain click on the map fires its
   internal click handler, which reports the clicked WGS84 point upward through
   the `onSelectPoint(lat, lon)` prop.

2. **`app/page.tsx`** receives that as `handleMapClick(lat, lon)`. It records the
   selected point, opens the parcel side-panel (`setPanel('parcel')`), and calls
   `loadParcel(lat, lon)` from the parcel-data hook.

3. **`hooks/useParcelData.ts`** runs `loadParcel`. It sets the status to
   `'loading'`, stamps the request with an incrementing id (so a later click can
   supersede an earlier slow one), and calls `fetchParcel(lat, lon)`.

4. **`lib/geoAdmin.ts`** `fetchParcel` calls the generic client
   **`lib/apiClient.ts`** `apiGet('/parcel', { lat, lon })`, which issues
   `fetch('/api/parcel?lat=...&lon=...')`.

5. **`next.config.mjs`** has a rewrite rule that proxies any `/api/:path*` to the
   FastAPI backend (default `http://localhost:8000`). So the browser's
   `/api/parcel` request lands on the Python server.

6. **`backend/app/routes.py`** handles `GET /api/parcel` in the `parcel()`
   function. It first converts the WGS84 point to LV95 with
   `wgs84_to_lv95` (from `coordinates.py`), then runs three lookups concurrently
   with `asyncio.gather`:
   - `identify_parcel(easting, northing)` (required: number, EGRID, canton,
     LV95 outline geometry, Geoportal link),
   - `identify_zone(easting, northing)` (optional: harmonized building zone),
   - `lookup_location(easting, northing)` (optional: address, PLZ, place,
     Gemeinde).

7. **`backend/app/geoadmin.py`** makes the actual HTTP calls to geo.admin.ch via a
   shared `httpx.AsyncClient`. Each lookup uses the MapServer "identify" endpoint
   on a specific layer. If no parcel exists at the point, `identify_parcel`
   returns `None` and the route answers the bare body `{ "found": false }`.

8. Back in `routes.py`, the handler assembles the response:
   - `planar_area_m2(geometry)` (from `coordinates.py`) computes the area in m²
     from the LV95 outline using the shoelace formula,
   - `reproject_geometry(geometry)` reprojects the outline from LV95 to WGS84 so
     Leaflet can draw it,
   - `resolve_location(...)` (in `geoadmin.py`) picks the correct street address
     by matching the building's EGRID to the parcel's EGRID,
   - `oereb_pdf_url(canton, egrid)` (from `oereb.py`) builds the official OEREB
     PDF link.
   The handler returns a `ParcelResponse` (shaped by `backend/app/schemas.py`) as
   JSON.

9. The JSON travels back up: backend -> Next.js rewrite -> browser. In
   **`lib/geoAdmin.ts`**, `fetchParcel` resolves with the typed `ParcelData`.

10. **`hooks/useParcelData.ts`** checks that this is still the newest request,
    stores the parcel and zone in React state, and sets status to `'loaded'`.

11. **`app/page.tsx`** re-renders. It passes the parcel into **`components/ParcelPanel.tsx`**,
    which displays the area, zone, address, EGRID and action buttons. Two more
    hooks fire in the background off the new parcel:
    - **`hooks/useDenkmalschutz.ts`** calls `GET /api/denkmalschutz` to check the
      ISOS and KGS heritage inventories at the parcel's LV95 point, surfaced as a
      badge in `components/DenkmalschutzBadge.tsx`.
    - **`hooks/useExactZone.ts`** calls `GET /api/exact-zone` to fetch the precise
      cantonal zone(s) from the OEREB cadastre.

12. **`components/Map.tsx`** also re-renders: it receives the parcel's WGS84
    geometry as a prop and draws the red selected-parcel outline on the map.

That single click therefore touches the map component, the page, two or three
hooks, two lib clients, the Next.js rewrite, the FastAPI router, and four backend
modules (coordinates, geoadmin, oereb, schemas) before the panel updates.

---

## Backend tour

The backend is a small FastAPI package under `backend/app/`. Each module has a
single, focused job.

- **`main.py`**: the FastAPI application object (`app`) that the ASGI server runs
  (`uvicorn app.main:app`). It enables permissive CORS for local development,
  mounts the API router, exposes a `/health` liveness probe, and closes the shared
  httpx client on shutdown.
- **`config.py`**: shared constants in one place: the two geo.admin.ch endpoint
  URLs (SearchServer and the MapServer identify endpoint), the proj4 string that
  defines the LV95 projection (kept byte-for-byte identical to the frontend), and
  the directory of cantonal OEREB service base URLs.
- **`routes.py`**: the `APIRouter` (prefix `/api`) declaring the five GET
  endpoints. Each handler is deliberately thin: it delegates the real work to the
  geoadmin / coordinates / oereb / area_search modules and only translates results
  and upstream failures into HTTP responses (a failed required call becomes HTTP
  502).
- **`schemas.py`**: the Pydantic v2 response models. These define the exact JSON
  shape and camelCase field names returned to the frontend, matching the
  TypeScript interfaces in `types/parcel.ts`.
- **`geoadmin.py`**: the data-access layer. It wraps the geo.admin.ch SearchServer
  and the MapServer identify endpoint behind small async helpers
  (`search_locations`, `identify_parcel`, `identify_zone`, `lookup_location`,
  `gwr_buildings_in_bbox`, `check_denkmalschutz`) on one pooled httpx client.
  Optional lookups degrade gracefully to null/empty instead of failing the request.
- **`coordinates.py`**: the pyproj-based coordinate transforms (`wgs84_to_lv95`,
  `lv95_to_wgs84`), the GeoJSON geometry reprojection (`reproject_geometry`), and
  the shoelace area calculation (`planar_area_m2`). It also contains a workaround
  so PROJ can find its database even though the project path contains a colon.
- **`oereb.py`**: the OEREB helpers. `oereb_pdf_url` builds the official PDF
  extract link; `fetch_exact_zones` queries a cantonal OEREB JSON extract and
  distils it down to the precise land-use zone(s) and their area shares.
- **`area_search.py`**: the bounding-box "area search" orchestration. Given an
  LV95 bounding box and filters, it finds parcels containing buildings (via GWR),
  resolves each parcel's area and zone with bounded concurrency, applies the
  filters, and returns the matches.

---

## Frontend tour

The frontend is a Next.js 14 App Router project. Folders are organised by role.

- **`app/`**: the Next.js entry point. `layout.tsx` is the shell wrapped around
  every page (the `<html>`/`<body>`, global stylesheet, fonts and page metadata).
  `page.tsx` is the single application page: it owns the top-level state (which
  panel is open, the selected point, owner groups) and wires the map, search,
  panels and hooks together. Most of the "what happens when X" glue lives here.
- **`components/`**: the UI building blocks. The most important are `Map.tsx` (the
  Leaflet map, base layers, overlays, parcel outlines and the measurement tool),
  `SearchBar.tsx` (the debounced, cancellable search box and its dropdown),
  `ParcelPanel.tsx` (the detail panel for one parcel) and `WatchlistPanel.tsx`
  (the saved-parcel collection). The rest are smaller pieces composed into these.
- **`hooks/`**: reusable React state logic. `useParcelData` loads parcel + zone
  for a point, `useDenkmalschutz` runs the heritage check, `useExactZone` fetches
  the precise OEREB zone, and `useWatchlist` manages the localStorage-backed saved
  list.
- **`lib/`**: non-UI helpers. `apiClient.ts` is the tiny `fetch` wrapper; `geoAdmin.ts`,
  `oereb.ts` and `areaSearch.ts` are thin typed clients for the backend endpoints;
  `coordinates.ts` is the browser-side proj4 conversion for the measurement tool;
  `format.ts` formats numbers the Swiss way; `owners.ts` groups parcels by owner
  and assigns colours.
- **`types/`**: shared TypeScript type definitions (`parcel.ts`) describing the
  exact shape of the data: search results, parcel info, watchlist entries, owner
  details and comments.

---

## Key algorithms explained simply

### WGS84 <-> LV95 coordinate conversion

The browser map speaks WGS84 (GPS latitude/longitude); the Swiss federal APIs
speak LV95 (metric easting/northing). Converting between them is a geodetic
projection: the Swiss "oblique Mercator" (somerc) projection, anchored near the
old Bern observatory, with a false origin at (2'600'000, 1'200'000), on the Bessel
ellipsoid, plus the official datum shift to WGS84. The backend
(`coordinates.py`) does this with `pyproj`; the browser (`lib/coordinates.ts`)
does it with `proj4` for the measurement tool only. Both use the exact same proj4
definition string, so the numbers match on both sides.

### Shoelace area formula

A parcel outline is a closed polygon of LV95 corner points. Because LV95 is metric
(coordinates are metres), the area in square metres can be computed directly with
the shoelace (surveyor's) formula: walk the ring summing the cross products of
consecutive vertices, `sum(x_i * y_{i+1} - x_{i+1} * y_i)`, take half the absolute
value. `_ring_area` does this for one ring; `planar_area_m2` adds up outer rings,
subtracts holes, and sums across MultiPolygons and GeometryCollections. No map
projection distortion correction is needed at parcel scale.

### OEREB exact-zone parsing

The harmonized federal zone (e.g. "Wohnzonen") is coarse. The precise cantonal
zone (e.g. "Wohnzone 2") comes from the canton's OEREB JSON extract, but the JSON
layout varies by canton. So `fetch_exact_zones` (`oereb.py`) walks the whole
decoded document recursively (`_collect_nutzungsplanung`) looking for every
restriction whose Theme code contains "Nutzungsplanung" and that has a legend text.
It picks the German text, keeps only base land-use zones (TypeCode 1-4, excluding
overlays 5-9 such as Gefahrenzone or Bebauungsplan), sums the area share per zone,
sorts by share descending, and returns each zone with its percentage. It never
raises: a network or parse problem degrades to an empty zone list.

### GWR-based area search (and why it is a capped sample)

The area search (`area_search.py`) answers "show me parcels with buildings inside
this municipality that match these filters". It cannot enumerate every parcel
directly, so it works through buildings in the GWR register:

1. Query all GWR buildings inside the LV95 bounding box. The geo.admin.ch identify
   endpoint caps an envelope query at about 200 features, so for a large area this
   is **not exhaustive**: hitting the cap sets `capped: true` to tell the user the
   area is not fully covered.
2. Deduplicate buildings to parcels by EGRID (keeping the newest construction year
   as the parcel's representative Baujahr).
3. Apply a cheap year pre-filter (no extra network calls).
4. Keep only the first 90 distinct parcels (`MAX_PARCEL_LOOKUPS`) so a huge area
   stays fast; `scanned` reports how many were found before this cap.
5. For each kept parcel, resolve its area and zone with at most 8 parcels in
   flight at once (a Semaphore), swallowing any single parcel's error.
6. Apply the area and zone filters and sort by area descending.

Because of the GWR cap and the 90-parcel lookup cap, the result is a bounded
**sample**, not a guaranteed complete list. This trade-off keeps the search fast
and within the upstream limits, and the `capped` and `scanned` fields make the
limitation visible in the UI.

---

## Complete file map

Every source file in the repository, with a one-line description. (Generated
build artifacts, `node_modules/`, the Python `.venv/`, lockfiles and font binaries
are omitted.)

### Backend (`backend/`)

| File | Description |
|------|-------------|
| `backend/app/__init__.py` | Package docstring and module overview for the FastAPI backend. |
| `backend/app/main.py` | FastAPI application object, CORS, router mount, `/health` probe, shutdown cleanup. |
| `backend/app/config.py` | Shared constants: geo.admin.ch URLs, LV95 proj4 string, cantonal OEREB service directory. |
| `backend/app/routes.py` | The five `/api` GET endpoints; thin handlers that delegate and map errors to HTTP 502. |
| `backend/app/schemas.py` | Pydantic v2 response models: the JSON contract with the frontend. |
| `backend/app/geoadmin.py` | Async clients for the geo.admin.ch SearchServer and MapServer identify endpoint. |
| `backend/app/coordinates.py` | pyproj WGS84<->LV95 transforms, geometry reprojection, shoelace area. |
| `backend/app/oereb.py` | OEREB PDF-link builder and recursive exact-zone JSON extraction. |
| `backend/app/area_search.py` | Bounding-box area search: GWR buildings -> parcels -> filtered results. |
| `backend/README.md` | How to run the backend and what each endpoint does. |

### Frontend entry (`app/`)

| File | Description |
|------|-------------|
| `app/layout.tsx` | Root layout: the `<html>`/`<body>` shell, global CSS, fonts and page metadata. |
| `app/page.tsx` | The single app page: top-level state and the glue wiring map, search, panels and hooks. |
| `app/globals.css` | Global stylesheet (Tailwind layers and base styles), applied app-wide. |

### Components (`components/`)

| File | Description |
|------|-------------|
| `components/Map.tsx` | The interactive Leaflet map: base layers, overlays, parcel outlines, measurement tool. |
| `components/SearchBar.tsx` | Debounced, cancellable search box with a results dropdown (addresses, parcels, areas). |
| `components/AreaFilterForm.tsx` | Inline filter form (zone, area, Baujahr) shown under a chosen Gemeinde/Ort in search. |
| `components/AreaSearchPanel.tsx` | Runs an "all parcels in this area" search and lists the matching parcels. |
| `components/ParcelPanel.tsx` | Detail sidebar for one parcel: facts, owner editor, comments, action buttons. |
| `components/WatchlistPanel.tsx` | The saved-parcel collection: sort, filter, edit, export (CSV/Excel), open compare. |
| `components/CompareModal.tsx` | Full-screen modal comparing several saved parcels side by side. |
| `components/CommentSection.tsx` | The notes/comments UI for a parcel (list, edit, delete, post). |
| `components/DenkmalschutzBadge.tsx` | Small coloured badge summarising the ISOS/KGS heritage-protection status. |
| `components/OwnerFields.tsx` | Editable owner-details form with type-ahead reuse of existing owners. |
| `components/OwnerQuickPick.tsx` | Colour-coded chips of existing owners; clicking one copies that owner onto the parcel. |
| `components/OwnerListPanel.tsx` | Sidebar listing all owners across saved parcels, with sort, filter and export. |

### Hooks (`hooks/`)

| File | Description |
|------|-------------|
| `hooks/useParcelData.ts` | Loads parcel + zone for a WGS84 point, with request-supersession and error states. |
| `hooks/useDenkmalschutz.ts` | Runs the ISOS/KGS heritage check for the parcel's LV95 point. |
| `hooks/useExactZone.ts` | Fetches the precise cantonal OEREB zone(s) for the parcel. |
| `hooks/useWatchlist.ts` | Manages the localStorage-backed saved watchlist (add, remove, patch, comments). |

### Lib (`lib/`)

| File | Description |
|------|-------------|
| `lib/apiClient.ts` | Tiny `fetch` wrapper that GETs `/api{path}` with params and parses JSON. |
| `lib/geoAdmin.ts` | Typed backend clients for `/search`, `/parcel` and `/denkmalschutz`. |
| `lib/oereb.ts` | Typed backend client for `/exact-zone` plus zone-formatting helper. |
| `lib/areaSearch.ts` | Typed backend client for `/area-search`, filter types and zone options. |
| `lib/coordinates.ts` | Browser-side proj4 WGS84<->LV95 conversion for the on-map measurement tool. |
| `lib/format.ts` | Swiss number formatting (e.g. `1240` -> `1'240`). |
| `lib/owners.ts` | Owner serialization, grouping keys, and colour assignment for owner groups. |

### Types (`types/`)

| File | Description |
|------|-------------|
| `types/parcel.ts` | Shared TypeScript interfaces: SearchResult, ParcelInfo, WatchlistEntry, OwnerInfo, comments. |

### Config and project files (root)

| File | Description |
|------|-------------|
| `next.config.mjs` | Next.js config; rewrites `/api/*` to the FastAPI backend (default `localhost:8000`). |
| `tailwind.config.ts` | Tailwind theme: content paths, the `ink`/`brand`/`canvas` colour scales, fonts, shadows. |
| `postcss.config.mjs` | PostCSS config enabling the Tailwind CSS plugin. |
| `tsconfig.json` | TypeScript compiler settings and the `@/` path alias. |
| `package.json` | Frontend dependencies and npm scripts (`dev`, `build`, `start`, `lint`). |
| `next-env.d.ts` | Next.js auto-generated TypeScript ambient types (do not edit). |
| `README.md` | Project overview, motivation, run instructions, data sources and limitations. |
| `ARCHITECTURE.md` | This document: the system walkthrough and complete file map. |

---

## How to run it

The app has two parts that must both run: the Python backend (port 8000) and the
Next.js frontend (port 3000, which proxies `/api` to the backend). Full,
copy-pasteable instructions are in the top-level [README.md](./README.md) under
"How to open the app", and backend-only instructions are in
[backend/README.md](./backend/README.md). Once the backend is running, its
interactive API docs are at `http://localhost:8000/docs`.
