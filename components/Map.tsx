'use client';

import { useEffect, useState } from 'react';
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Marker,
  Pane,
  Polygon,
  Polyline,
  TileLayer,
  WMSTileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { NO_OWNER_COLOR } from '@/lib/owners';
import { wgs84ToLV95 } from '@/lib/coordinates';
import { formatSwissNumber } from '@/lib/format';

// --- Measurement (distance / area) ---------------------------------------
type MeasureMode = 'none' | 'distance' | 'area';
const MEASURE_COLOR = '#ea580c'; // orange — distinct from red selection + owner colours

/** Total length of the path in metres (euclidean in metric LV95). */
function measureDistanceM(points: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const [e1, n1] = wgs84ToLV95(points[i - 1][0], points[i - 1][1]);
    const [e2, n2] = wgs84ToLV95(points[i][0], points[i][1]);
    total += Math.hypot(e2 - e1, n2 - n1);
  }
  return total;
}

/** Polygon area in m² via the shoelace formula on metric LV95 coordinates. */
function measureAreaM2(points: [number, number][]): number {
  if (points.length < 3) return 0;
  const lv = points.map(([lat, lon]) => wgs84ToLV95(lat, lon));
  let sum = 0;
  for (let i = 0; i < lv.length; i++) {
    const [x1, y1] = lv[i];
    const [x2, y2] = lv[(i + 1) % lv.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${formatSwissNumber(m)} m`;
}

function formatArea(m2: number): string {
  const base = `${formatSwissNumber(m2)} m²`;
  return m2 >= 10000 ? `${base} · ${(m2 / 10000).toFixed(2)} ha` : base;
}

// Small white-filled, orange-ringed handle for draggable measurement vertices.
const measureVertexIcon = L.divIcon({
  className: 'measure-vertex-icon',
  html: `<span style="display:block;width:13px;height:13px;border-radius:9999px;background:#fff;border:2px solid ${MEASURE_COLOR};box-shadow:0 1px 3px rgba(0,0,0,0.35)"></span>`,
  iconSize: [13, 13],
  iconAnchor: [6.5, 6.5],
});

// Default view: Zug.
const DEFAULT_CENTER: [number, number] = [47.1662, 8.5154];
const DEFAULT_ZOOM = 13;

type BaseLayerId = 'color' | 'satellite';
type ParcelLineStyle = 'gray' | 'white' | null;

const BASE_LAYERS: Record<
  BaseLayerId,
  { label: string; url: string; maxZoom: number; tileClass?: string; parcelLines: ParcelLineStyle }
> = {
  color: {
    label: 'Karte',
    url: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
    maxZoom: 19,
    parcelLines: null,
  },
  satellite: {
    label: 'Satellit',
    url: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg',
    maxZoom: 20,
    parcelLines: 'white',
  },
};

// All cadastral parcel boundaries (CadastralWebMap via transparent WMS).
// The raw layer draws dark lines and green vegetation fills on white;
// per-view CSS filters + blend modes on the pane reduce it to pure
// boundary lines: white on satellite imagery, soft gray on the simple map.
// This layer also carries the parcel numbers, so it is off by default — the
// number is shown in the popup on click instead.
const PARCEL_WMS_URL = 'https://wms.geo.admin.ch/';

const PARCEL_PANE_STYLES: Record<Exclude<ParcelLineStyle, null>, Partial<CSSStyleDeclaration>> = {
  // invert: lines -> white; contrast crushes the white background and the
  // green fills to black, which "screen" blending makes fully invisible
  // (no filling). brightness then dims the bright-white lines down to a
  // faint light grey, and the low opacity keeps them unobtrusive.
  white: {
    filter: 'grayscale(1) invert(1) contrast(3) brightness(0.6)',
    mixBlendMode: 'screen',
    opacity: '0.45',
  },
  // brightness pushes the green fills to white, which "multiply" blending
  // makes invisible; the dark boundary lines remain as soft gray.
  gray: {
    filter: 'grayscale(1) brightness(1.35)',
    mixBlendMode: 'multiply',
    opacity: '0.5',
  },
};

function ParcelPaneStyler({ mode }: { mode: ParcelLineStyle }) {
  const map = useMap();
  useEffect(() => {
    const pane = map.getPane('parcel-lines');
    if (!pane || !mode) return;
    Object.assign(pane.style, PARCEL_PANE_STYLES[mode]);
  }, [map, mode]);
  return null;
}

// Harmonized building zones as a semi-transparent overlay.
// Tiles exist up to z18; maxNativeZoom lets Leaflet upscale beyond that.
const ZONE_OVERLAY_URL =
  'https://wmts.geo.admin.ch/1.0.0/ch.are.bauzonen/default/current/3857/{z}/{x}/{y}.png';

export interface FlyTarget {
  lat: number;
  lon: number;
  zoom?: number;
  /** Monotonic counter so flying to the same coords twice still triggers. */
  key: number;
}

/** A watchlist parcel outline to draw, coloured by its owner. */
export interface OwnerShape {
  egrid: string;
  geometry: Geometry;
  ownerKey: string | null;
  /** Resolved owner colour, or null for parcels without an owner. */
  color: string | null;
}

/** Request to zoom the map to all parcels of one owner. */
export interface OwnerFocus {
  ownerKey: string;
  /** Monotonic counter so focusing the same owner twice still triggers. */
  key: number;
}

interface MapProps {
  onSelectPoint: (lat: number, lon: number) => void;
  flyTarget: FlyTarget | null;
  parcelGeometry: Geometry | null;
  /** Changes whenever a new parcel is loaded so the GeoJSON layer re-renders. */
  parcelKey: string;
  selectedPoint: { lat: number; lon: number } | null;
  /** Watchlist parcels available to highlight (only the focused owner's are drawn). */
  ownerShapes: OwnerShape[];
  /** EGRID of the currently selected parcel — drawn as the red outline instead. */
  selectedEgrid: string | null;
  /** The owner whose parcels are highlighted + zoomed to (null = none shown). */
  ownerFocus: OwnerFocus | null;
}

function ClickHandler({ onClick }: { onClick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click: (event) => onClick(event.latlng.lat, event.latlng.lng),
  });
  return null;
}

function FlyTo({ target }: { target: FlyTarget | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo([target.lat, target.lon], target.zoom ?? 17, { duration: 0.8 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.key]);
  return null;
}

/** Zooms the map to fit every parcel of the focused owner. */
function OwnerFocuser({ shapes, focus }: { shapes: OwnerShape[]; focus: OwnerFocus | null }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    const features: Feature[] = shapes
      .filter((s) => s.ownerKey === focus.ownerKey)
      .map((s) => ({ type: 'Feature', geometry: s.geometry, properties: {} }));
    if (features.length === 0) return;
    const collection: FeatureCollection = { type: 'FeatureCollection', features };
    const bounds = L.geoJSON(collection).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 18 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key]);
  return null;
}

/** Toggles the crosshair cursor on the actual map container while measuring. */
function MeasureCursor({ active }: { active: boolean }) {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    el.classList.toggle('is-measuring', active);
    return () => el.classList.remove('is-measuring');
  }, [map, active]);
  return null;
}

function MaxZoomUpdater({ maxZoom }: { maxZoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setMaxZoom(maxZoom);
    if (map.getZoom() > maxZoom) map.setZoom(maxZoom);
  }, [map, maxZoom]);
  return null;
}

export default function Map({
  onSelectPoint,
  flyTarget,
  parcelGeometry,
  parcelKey,
  selectedPoint,
  ownerShapes,
  selectedEgrid,
  ownerFocus,
}: MapProps) {
  const [baseLayer, setBaseLayer] = useState<BaseLayerId>('satellite');
  const [showZones, setShowZones] = useState(false);
  const [showBorders, setShowBorders] = useState(false);
  const [measureMode, setMeasureMode] = useState<MeasureMode>('none');
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([]);
  const layer = BASE_LAYERS[baseLayer];

  const toggleMeasure = (mode: Exclude<MeasureMode, 'none'>) => {
    setMeasurePoints([]);
    setMeasureMode((prev) => (prev === mode ? 'none' : mode));
  };

  const updateMeasurePoint = (index: number, lat: number, lon: number) => {
    setMeasurePoints((prev) => prev.map((p, i) => (i === index ? [lat, lon] : p)));
  };

  return (
    <>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        maxZoom={layer.maxZoom}
        zoomControl={false}
        className="h-full w-full"
      >
        <ZoomControl position="bottomright" />
        <MeasureCursor active={measureMode !== 'none'} />
        <TileLayer
          key={baseLayer}
          url={layer.url}
          attribution="&copy; swisstopo"
          maxZoom={layer.maxZoom}
          className={layer.tileClass}
        />
        <Pane name="parcel-lines" style={{ zIndex: 250 }}>
          {showBorders && layer.parcelLines && (
            <WMSTileLayer
              key={`parcels-${baseLayer}`}
              url={PARCEL_WMS_URL}
              params={{
                layers: 'ch.kantone.cadastralwebmap-farbe',
                format: 'image/png',
                transparent: true,
                version: '1.3.0',
              }}
              minZoom={14}
              maxZoom={20}
              attribution="&copy; Kantone (AV)"
            />
          )}
        </Pane>
        {showBorders && <ParcelPaneStyler mode={layer.parcelLines} />}
        {showZones && (
          <TileLayer
            url={ZONE_OVERLAY_URL}
            attribution="&copy; ARE"
            opacity={0.45}
            maxNativeZoom={18}
            maxZoom={20}
          />
        )}

        {/* Watchlist parcels coloured by owner (non-interactive so clicks fall
            through to the map). The selected parcel is skipped here — it is
            drawn as the red outline below. Only the parcels of the owner shown
            from the Eigentümer list are highlighted. */}
        {ownerFocus &&
          ownerShapes
            .filter(
              (shape) => shape.ownerKey === ownerFocus.ownerKey && shape.egrid !== selectedEgrid
            )
            .map((shape) => {
              const color = shape.color ?? NO_OWNER_COLOR;
              return (
                <GeoJSON
                  key={`owner-${shape.egrid}-${color}`}
                  data={shape.geometry}
                  interactive={false}
                  style={{
                    color,
                    weight: 2.5,
                    fillColor: color,
                    fillOpacity: 0.35,
                  }}
                />
              );
            })}

        <MaxZoomUpdater maxZoom={layer.maxZoom} />
        <ClickHandler
          onClick={(lat, lon) => {
            if (measureMode === 'none') onSelectPoint(lat, lon);
            else setMeasurePoints((prev) => [...prev, [lat, lon]]);
          }}
        />
        <FlyTo target={flyTarget} />

        {/* Live measurement geometry. */}
        {measureMode !== 'none' && measurePoints.length > 0 && (
          <>
            {measureMode === 'area' && measurePoints.length >= 3 ? (
              <Polygon
                positions={measurePoints}
                pathOptions={{
                  color: MEASURE_COLOR,
                  weight: 2,
                  fillColor: MEASURE_COLOR,
                  fillOpacity: 0.15,
                }}
              />
            ) : (
              <Polyline
                positions={measurePoints}
                pathOptions={{ color: MEASURE_COLOR, weight: 3, dashArray: '6 5' }}
              />
            )}
            {measurePoints.map((point, index) => (
              <Marker
                key={index}
                position={point}
                draggable
                icon={measureVertexIcon}
                eventHandlers={{
                  dragend: (event) => {
                    const ll = event.target.getLatLng();
                    updateMeasurePoint(index, ll.lat, ll.lng);
                  },
                }}
              />
            ))}
          </>
        )}
        <OwnerFocuser shapes={ownerShapes} focus={ownerFocus} />
        {parcelGeometry && (
          <GeoJSON
            key={parcelKey}
            data={parcelGeometry}
            interactive={false}
            style={{ color: '#dc2626', weight: 2.5, fillColor: '#dc2626', fillOpacity: 0.08 }}
          />
        )}
        {selectedPoint && (
          <CircleMarker
            center={[selectedPoint.lat, selectedPoint.lon]}
            radius={5}
            pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 0.9 }}
          />
        )}
      </MapContainer>

      {/* Measurement readout (top-center). */}
      {measureMode !== 'none' && (
        <div className="absolute left-1/2 top-4 z-[1100] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-ink-200/70 bg-white/85 px-4 py-2 shadow-float ring-1 ring-black/5 backdrop-blur-md">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold tabular-nums text-ink-900">
              {measureMode === 'distance'
                ? formatDistance(measureDistanceM(measurePoints))
                : formatArea(measureAreaM2(measurePoints))}
            </span>
            <span className="text-[11px] text-ink-400">
              {measurePoints.length === 0
                ? 'Punkte auf der Karte setzen'
                : measureMode === 'area' && measurePoints.length < 3
                ? `${measurePoints.length} Punkte · mind. 3`
                : `${measurePoints.length} Punkte`}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMeasurePoints((prev) => prev.slice(0, -1))}
              disabled={measurePoints.length === 0}
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-ink-600 transition-colors hover:bg-ink-100 disabled:opacity-40"
            >
              Rückgängig
            </button>
            <button
              type="button"
              onClick={() => setMeasurePoints([])}
              disabled={measurePoints.length === 0}
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-ink-600 transition-colors hover:bg-ink-100 disabled:opacity-40"
            >
              Löschen
            </button>
            <button
              type="button"
              onClick={() => {
                setMeasureMode('none');
                setMeasurePoints([]);
              }}
              className="rounded-lg bg-ink-900 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-ink-800"
            >
              Fertig
            </button>
          </div>
        </div>
      )}

      {/* Bottom-left control toolbar. */}
      <div className="absolute bottom-5 left-4 z-[1000] max-w-[calc(100%-2rem)]">
        <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-xl border border-ink-200 bg-white p-0.5 shadow-float">
          {(Object.keys(BASE_LAYERS) as BaseLayerId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setBaseLayer(id)}
              aria-pressed={baseLayer === id}
              className={`rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors ${
                baseLayer === id
                  ? 'bg-ink-900 text-white shadow-sm'
                  : 'text-ink-600 hover:bg-ink-100'
              }`}
            >
              {BASE_LAYERS[id].label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowBorders((v) => !v)}
          aria-pressed={showBorders}
          title="Alle Parzellengrenzen (inkl. Nummern) als Ebene einblenden"
          className={`rounded-xl border px-3 py-2 text-xs font-medium shadow-float transition-colors ${
            showBorders
              ? 'border-ink-900 bg-ink-900 text-white'
              : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-100'
          }`}
        >
          Grenzen
        </button>
        <button
          type="button"
          onClick={() => setShowZones((v) => !v)}
          aria-pressed={showZones}
          title="Bauzonen (harmonisiert) als halbtransparente Ebene einblenden"
          className={`rounded-xl border px-3 py-2 text-xs font-medium shadow-float transition-colors ${
            showZones
              ? 'border-brand-600 bg-brand-600 text-white'
              : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-100'
          }`}
        >
          Zonen
        </button>
        </div>
      </div>

      {/* Measurement tools — bottom-right, just left of the zoom control. */}
      <div className="absolute bottom-6 right-14 z-[1000] flex overflow-hidden rounded-xl border border-ink-200 bg-white p-0.5 shadow-float">
        <button
          type="button"
          onClick={() => toggleMeasure('distance')}
          aria-pressed={measureMode === 'distance'}
          title="Distanz messen — Punkte auf der Karte setzen"
          className={`flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-xs font-medium transition-colors ${
            measureMode === 'distance'
              ? 'bg-orange-500 text-white shadow-sm'
              : 'text-ink-600 hover:bg-ink-100'
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
            <path d="M4 20L20 4" />
            <path d="M4 16l2 2M8 12l2 2M12 8l2 2M16 4l2 2" />
          </svg>
          Distanz
        </button>
        <button
          type="button"
          onClick={() => toggleMeasure('area')}
          aria-pressed={measureMode === 'area'}
          title="Fläche messen — Polygon auf der Karte zeichnen"
          className={`flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-xs font-medium transition-colors ${
            measureMode === 'area'
              ? 'bg-orange-500 text-white shadow-sm'
              : 'text-ink-600 hover:bg-ink-100'
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
            <path d="M3 7l9-4 9 4-9 4-9-4z" />
            <path d="M3 7v8l9 4 9-4V7" />
          </svg>
          Fläche
        </button>
      </div>
    </>
  );
}
