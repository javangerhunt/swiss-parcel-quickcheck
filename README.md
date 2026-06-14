# Swiss Parcel Quick-Check

> Click any spot on a map of Switzerland and instantly learn everything that
> matters about that piece of land: its planning zone, its size in m², its
> official EGRID identifier, and whether it is under heritage protection. Record
> who owns it, and export the whole shortlist as a spreadsheet.

Built as a personal research tool for real-estate **acquisition** work, with a
focus on Canton Zug.

---

## What it does

Open the app, and you see an interactive map of Switzerland. From there you can:

- **Find a parcel** by clicking it on the map, or by searching for an address, a
  parcel number (`<municipality> <number>`, e.g. `Hünenberg 1234`) or an EGRID.
- **Read its key facts instantly**: building/planning zone, exact area in m²,
  EGRID, the municipality, and a direct link to the official cantonal Geoportal
  and the ÖREB cadastre PDF extract.
- **See heritage-protection warnings**: a badge tells you if the parcel sits in a
  nationally protected townscape (ISOS) or holds a listed cultural property (KGS).
- **Record the owner** of each parcel, reusing owners you have already entered so
  the same person/company stays consistent across parcels.
- **Star parcels onto a watchlist** that survives page reloads (saved in your
  browser), add free-text notes, sort and filter the list, compare parcels
  side-by-side, and **export everything to CSV or Excel**.
- **Measure** distances and areas directly on the map.

No login, no account, no API key. It runs entirely on free, public Swiss federal
map data (geo.admin.ch / swisstopo).

---

## Why I built it

I currently work in the real-estate industry in **acquisition**: my job is
finding and securing new properties. A normal feasibility check on a parcel means
opening several different tools: a cantonal geoportal to find the zone, the
federal cadastre for the EGRID and ÖREB restrictions, separate inventories to
check for heritage protection, and a spreadsheet to keep track of it all. Doing
that for dozens of parcels, by hand, is slow and error-prone.

I built Swiss Parcel Quick-Check to collapse that whole routine into a single
click-and-record workflow. Concretely, it helps because:

- **It turns map research directly into an outreach list.** Acquisition is
  ultimately about contacting the *owner*. Being able to attach an owner to each
  parcel and then export a consolidated owner list means my map research becomes
  the contact list I actually work from, with no re-typing into a separate sheet.
- **It answers the first three questions of any deal in seconds.** Is it
  buildable (zone)? How big is it (m² / ha)? Is it encumbered or protected
  (ÖREB / ISOS / KGS)? Surfacing these instantly lets me screen and rank
  opportunities far faster, and drop the non-starters early.
- **It keeps everything in one place.** Instead of scattered tabs and
  spreadsheets, every parcel I'm tracking, with its zone, area, owner,
  protection status and my own notes, lives on one watchlist that persists
  between sessions.
- **Its output plugs into how I already work.** One-click CSV/Excel export means
  a shortlist can go straight into existing deal-tracking tools or be shared with
  colleagues.
- **It costs nothing and uploads nothing.** It uses only free public federal
  data, and the watchlist stays in my own browser, so a sensitive list of
  acquisition targets is never sent to any server.

---

## The problem it solves

Checking the basic facts of a Swiss parcel today means manually cross-referencing
several public systems that don't talk to each other, then copying the results
into your own notes. Swiss Parcel Quick-Check unifies those scattered lookups into
one map-based interface and adds the one thing the official tools don't: a place
to record the **owner** and export a working **shortlist**, exactly what
acquisition work needs.

---

## How to open the app

The same steps work on **Windows, macOS and Linux**. You need
[**Node.js**](https://nodejs.org) (version 18 or newer) and
[**Git**](https://git-scm.com) installed. Then open a terminal (on Windows use
PowerShell or Git Bash; on macOS/Linux use Terminal) and run the commands below.
The lines starting with `#` are just explanatory comments; you can skip them.

```bash
# 1. Get the code
git clone https://github.com/javangerhunt/swiss-parcel-quickcheck
cd swiss-parcel-quickcheck

# 2. Install the dependencies (one-time, downloads the libraries it needs)
npm install

# 3. Start the app
npm run dev
```

Now open **http://localhost:3000** in your web browser, and the app is running.

To stop it, press `Ctrl+C` in the terminal. (If port 3000 is already in use, Next.js
will tell you and offer the next free port, e.g. http://localhost:3001.)

> No environment variables, no API keys, and nothing to sign up for: clone,
> install, run.

---

## Features in detail

- **Search** an address, a parcel (`<municipality> <number>`) or an EGRID, or
  **click** anywhere on the map.
- Three **base-map views**: simplified grayscale (default), classic color map, and
  satellite imagery (swisstopo SWISSIMAGE).
- A toggleable **building-zone overlay** (`ch.are.bauzonen`) to scan a whole
  neighbourhood's zoning at a glance.
- **Official ÖREB-Kataster PDF extract** per parcel: one click opens the cantonal
  extract with all public-law restrictions (supported in 20 cantons incl. ZG and
  ZH; the button is hidden where the canton publishes no standard webservice).
- **Owner management**: record the owner of each parcel, with a colour tag and a
  type-ahead that reuses owners you've already entered.
- **Watchlist** with sorting (date, size, zone, name), free-text notes, CSV/Excel
  export, and a side-by-side **comparison view** of all saved parcels.
- An **owner list** view that aggregates owners across all saved parcels, and an
  **area search** that finds parcels within a municipality matching size/zone
  filters.
- On-map **measurement** of distances and areas.

---

## How it works

- The click point is converted from WGS84 (lat/lon) to the Swiss LV95 grid
  (EPSG:2056) client-side with `proj4`.
- Parallel "identify" calls against geo.admin.ch resolve the **parcel** (number,
  EGRID, outline geometry, Geoportal link) and the **planning zone**.
- The parcel **area** is computed client-side from the LV95 outline with a planar
  shoelace formula (LV95 is metric, so this gives an exact result in m²).
- Two background calls check the **ISOS** and **KGS** inventories; a warning badge
  appears if the parcel falls inside a protected area.
- **Watchlist** entries (including owner and free-text notes) are stored in the
  browser's `localStorage` and can be exported as CSV or Excel.

---

## Why these technologies

This is a small, self-contained front-end app with no server of its own. The stack
was chosen to keep it that way, staying free, key-less, and runnable by anyone who
clones it:

- **Next.js 14 + React (App Router)**: a modern, widely-used React framework. It
  gives a clean project structure (components, hooks, pages) and a one-command dev
  server, and it deploys for free on Vercel. React lets the UI update reactively as
  data arrives from the map APIs.
- **TypeScript**: typed JavaScript. The types (see `types/parcel.ts`) document the
  exact shape of the data coming back from the federal APIs and catch mistakes
  before the app runs. That is valuable when juggling many fields per parcel.
- **Leaflet + react-leaflet**: **Leaflet is the interactive-map engine**, a
  free, open-source JavaScript map library (the open alternative to the Google Maps
  API). The whole app is built around *clicking a point on a map of Switzerland*,
  and Leaflet is what makes that possible. It does three jobs here: it **displays
  the swisstopo map tiles** (grayscale, colour, satellite and the zoning overlay)
  and handles all the panning and zooming; it **reports where the user clicked** as
  real-world coordinates, which is the trigger for every lookup; and it **draws the
  results back onto the map**: the parcel outline, the selection marker, and the
  measurement tool. It was chosen over Google Maps specifically because it needs
  **no API key, no account, and no billing**, which is what lets this app be
  "clone, install, run". `react-leaflet` simply lets Leaflet be used as React
  components.
- **proj4**: converts coordinates between WGS84 (what the map and GPS use) and the
  Swiss LV95 grid (what the federal APIs and the area calculation use). Doing this
  in the browser avoids needing a backend.
- **xlsx**: generates the Excel export file directly in the browser.
- **Tailwind CSS**: utility-based styling, kept in the markup so the app needs no
  separate design system.

---

## Data sources

All data comes from **public Swiss federal APIs** (geo.admin.ch / swisstopo). There
is no backend and nothing to sign up for.

| Data | API | Documentation |
|------|-----|---------------|
| Address / parcel search | `api3.geo.admin.ch/rest/services/api/SearchServer` | [Search API docs](https://docs.geo.admin.ch/access-data/search.html) |
| Parcel geometry + EGRID | identify endpoint, layer `ch.kantone.cadastralwebmap-farbe` | [Identify API docs](https://docs.geo.admin.ch/access-data/identify-features.html) |
| Planning zone (harmonized building zones) | identify endpoint, layer `ch.are.bauzonen` | [Layer info](https://api3.geo.admin.ch/rest/services/api/MapServer/ch.are.bauzonen) |
| ISOS protected townscapes | identify endpoint, layer `ch.bak.bundesinventar-schuetzenswerte-ortsbilder` | [Dataset](https://opendata.swiss/de/dataset/bundesinventar-der-schutzenswerten-ortsbilder-der-schweiz-von-nationaler-bedeutung-isos) |
| KGS cultural property | identify endpoint, layer `ch.babs.kulturgueter` | [Layer info](https://api3.geo.admin.ch/rest/services/api/MapServer/ch.babs.kulturgueter) |
| Map tiles | `wmts.geo.admin.ch` (pixelkarte-grau / pixelkarte-farbe / swissimage, overlay ch.are.bauzonen) | [WMTS](https://wmts.geo.admin.ch) |
| ÖREB-Kataster PDF extract | Cantonal ÖREB webservices, `{base}/extract/pdf?EGRID=…` | [Official directory](https://www.cadastre.ch/de/oereb-webservice) |
| Coordinate conversion | `proj4` npm package (client-side LV95 ⇄ WGS84) | [proj4js](https://github.com/proj4js/proj4js) |

---

## Known limitations

- **Zone data is the harmonized federal category, not the detailed cantonal zone.**
  The app shows the `ch.are.bauzonen` category (e.g. "Wohnzonen", "Zentrumszonen")
  rather than the precise cantonal designation (e.g. "W2"). Parcels outside
  building zones (agricultural land etc.) show a "Daten nicht verfügbar" note;
  check the cantonal Geoportal for the exact zone.
- **ISOS/KGS are national-level inventories only.** Cantonal and communal
  Denkmalschutz registers are *not* checked. A green "Kein Denkmalschutz" badge
  does not rule out cantonal protection. Always verify in the cantonal Geoportal
  before a transaction.
- The watchlist lives in your browser's `localStorage`; it does not sync across
  devices.
- **ÖREB extracts are served by cantonal webservices** of varying speed and
  availability; generating the PDF can take up to ~30 seconds. Cantons without a
  published standard service (BE, LU, NE, UR, VD, VS) show no extract button.

---

## Tech stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Leaflet / react-leaflet ·
proj4 · xlsx. Deployable on the Vercel free tier.

## Project structure

```
app/         Next.js pages and global layout (the entry point and overall page)
components/  The UI building blocks (map, search bar, parcel panel, watchlist, …)
hooks/       Reusable React logic (loading parcel data, the watchlist, …)
lib/         Non-UI logic: API calls, coordinate maths, formatting, owners
types/       TypeScript definitions describing the shape of the data
```

## License

MIT
