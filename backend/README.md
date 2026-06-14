# Swiss Parcel Quick-Check: Python backend

This is the Python backend for Swiss Parcel Quick-Check. It is a
[FastAPI](https://fastapi.tiangolo.com) app that holds all of the data logic:

- the calls to the Swiss federal **geo.admin.ch** APIs (parcel search, parcel
  geometry, planning zone, heritage inventories),
- the **coordinate conversion** from WGS84 (lat/lon) to the Swiss LV95 grid
  (EPSG:2056) using `pyproj`,
- the **area calculation** from the LV95 parcel outline using a planar shoelace
  formula (LV95 is metric, so this returns an exact result in m²),
- the **OEREB cadastre** lookups (the cantonal public-law restriction extracts),
- and the **area search** that finds parcels in a municipality matching
  size/zone filters.

The browser (the Next.js frontend) never talks to the Swiss APIs directly. It
calls this backend under `/api`, and the backend returns ready-to-display JSON.
In development the frontend proxies `/api/*` to `http://localhost:8000`, so this
backend must be running for the app to work.

---

## How to run it

Open a terminal in the `backend` folder and run the steps below. The lines
starting with `#` are explanatory comments; you can skip them.

```bash
# 1. Move into the backend folder
cd backend

# 2. Create a virtual environment (one-time)
python -m venv .venv

# 3. Activate the virtual environment
#    macOS / Linux:
source .venv/bin/activate
#    Windows (PowerShell):
.venv\Scripts\Activate.ps1

# 4. Install the dependencies (one-time)
pip install -r requirements.txt

# 5. Start the backend
uvicorn app.main:app --reload --port 8000
```

The backend now runs on **http://localhost:8000**. The `--reload` flag restarts
it automatically when you change the code.

To stop it, press `Ctrl+C` in the terminal.

---

## Interactive API docs

FastAPI generates interactive API documentation for free. Once the backend is
running, open **http://localhost:8000/docs** in your browser to see every
endpoint, try it out, and inspect the request and response shapes.

---

## Endpoints

The backend exposes five endpoints under `/api`:

- **`/api/search`**: address, parcel (`<municipality> <number>`) or EGRID search.
- **`/api/parcel`**: parcel geometry, number, EGRID and computed area for a point.
- **`/api/denkmalschutz`**: heritage-protection check (ISOS townscapes and KGS
  cultural property).
- **`/api/exact-zone`**: the planning/building zone for a parcel.
- **`/api/area-search`**: finds parcels within a municipality matching
  size/zone filters.
