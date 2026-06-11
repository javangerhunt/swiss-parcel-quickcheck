# Swiss Parcel Quick-Check

Look up any Swiss land parcel on an interactive map: click a parcel (or search by address / parcel number) and instantly see its planning zone, size in m², EGRID, and whether it sits in a nationally protected area (ISOS townscape or KGS cultural property inventory). Star interesting parcels to keep a personal watchlist that persists in your browser — built for real estate acquisition professionals, with a focus on Canton Zug.

## Live demo

_Coming soon — deploy to [Vercel](https://vercel.com) and add the URL here._

## Screenshot

_Add a screenshot here after running the app (`docs/screenshot.png`)._

## Getting started

```bash
git clone https://github.com/yourname/swiss-parcel-quickcheck
cd swiss-parcel-quickcheck
npm install
npm run dev
# Open http://localhost:3000
```

## No API keys required

All data comes from **public Swiss federal APIs** (geo.admin.ch / swisstopo). There is no backend, no environment variables, and nothing to sign up for — clone, install, run.

## How it works

- **Search** an address, a parcel (`<municipality> <number>`, e.g. `Hünenberg 1234`) or an EGRID, or **click** anywhere on the map.
- Three **base map views**: simplified grayscale (default — roads stay in the background), classic color map, and satellite imagery (swisstopo SWISSIMAGE).
- Toggleable **building-zone overlay** (`ch.are.bauzonen`) to scan a whole neighborhood's zoning at a glance.
- **Official ÖREB-Kataster PDF extract** per parcel — one click opens the cantonal extract with all public-law restrictions (supported in 20 cantons incl. ZG and ZH; the button is hidden where the canton publishes no standard webservice).
- **Watchlist** with sorting (date, size, zone, name), free-text notes, CSV export, and a side-by-side **comparison view** of all saved parcels.
- The click point is converted from WGS84 to LV95 (EPSG:2056) client-side with `proj4`.
- Parallel identify calls against geo.admin.ch resolve the **parcel** (number, EGRID, outline geometry, Geoportal link) and the **planning zone**.
- The parcel **area** is computed client-side from the LV95 outline with a planar shoelace formula (LV95 is metric, so this gives exact m²).
- Two background calls check the **ISOS** and **KGS** inventories; a warning badge appears if the parcel is in a protected area.
- **Watchlist** entries (incl. free-text notes) are stored in `localStorage` and can be exported as CSV.

## Data sources

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

## Known limitations

- **Zone data is the harmonized federal category, not the detailed cantonal zone.** The app shows the `ch.are.bauzonen` category (e.g. "Wohnzonen", "Zentrumszonen") rather than the precise cantonal designation (e.g. "W2"). Parcels outside building zones (agricultural land etc.) show "Daten nicht verfügbar — Geoportal prüfen"; check the cantonal Geoportal for the exact zone.
- **ISOS/KGS are national-level inventories only.** Cantonal and communal Denkmalschutz registers are *not* checked — a green "Kein Denkmalschutz" badge does not rule out cantonal protection. Always verify in the cantonal Geoportal before a transaction.
- The watchlist lives in your browser's `localStorage` — it does not sync across devices.
- **ÖREB extracts are served by cantonal webservices** of varying speed and availability; generating the PDF can take up to ~30 seconds. Cantons without a published standard service (BE, LU, NE, UR, VD, VS) show no extract button.

## Tech stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Leaflet / react-leaflet · proj4 — deployable on the Vercel free tier.

## Contributing

Issues and pull requests are welcome — English or German both fine. Please open an issue first for larger changes.

## License

MIT
