'use client';

import { useEffect, useState } from 'react';
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Pane,
  TileLayer,
  WMSTileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Geometry } from 'geojson';

// Default view: Zug
const DEFAULT_CENTER: [number, number] = [47.1662, 8.5154];
const DEFAULT_ZOOM = 13;

type BaseLayerId = 'simple' | 'color' | 'satellite';
type ParcelLineStyle = 'gray' | 'white' | null;

// "simple" (grayscale, washed out via .tiles-muted) is the default: roads
// recede into the background, which suits parcel work better than the
// road-heavy color map.
const BASE_LAYERS: Record<
  BaseLayerId,
  { label: string; url: string; maxZoom: number; tileClass?: string; parcelLines: ParcelLineStyle }
> = {
  simple: {
    label: 'Einfach',
    url: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-grau/default/current/3857/{z}/{x}/{y}.jpeg',
    maxZoom: 19,
    tileClass: 'tiles-muted',
    parcelLines: 'gray',
  },
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
const PARCEL_WMS_URL = 'https://wms.geo.admin.ch/';

const PARCEL_PANE_STYLES: Record<Exclude<ParcelLineStyle, null>, Partial<CSSStyleDeclaration>> = {
  // invert: lines -> white; contrast crushes the white background and the
  // green fills to black, which "screen" blending makes fully invisible.
  white: {
    filter: 'grayscale(1) invert(1) contrast(3)',
    mixBlendMode: 'screen',
    opacity: '0.9',
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

interface MapProps {
  onSelectPoint: (lat: number, lon: number) => void;
  flyTarget: FlyTarget | null;
  parcelGeometry: Geometry | null;
  /** Changes whenever a new parcel is loaded so the GeoJSON layer re-renders. */
  parcelKey: string;
  selectedPoint: { lat: number; lon: number } | null;
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
}: MapProps) {
  const [baseLayer, setBaseLayer] = useState<BaseLayerId>('simple');
  const [showZones, setShowZones] = useState(false);
  const layer = BASE_LAYERS[baseLayer];

  return (
    <>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        maxZoom={layer.maxZoom}
        className="h-full w-full"
      >
        <TileLayer
          key={baseLayer}
          url={layer.url}
          attribution="&copy; swisstopo"
          maxZoom={layer.maxZoom}
          className={layer.tileClass}
        />
        <Pane name="parcel-lines" style={{ zIndex: 250 }}>
          {layer.parcelLines && (
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
        <ParcelPaneStyler mode={layer.parcelLines} />
        {showZones && (
          <TileLayer
            url={ZONE_OVERLAY_URL}
            attribution="&copy; ARE"
            opacity={0.45}
            maxNativeZoom={18}
            maxZoom={20}
          />
        )}
        <MaxZoomUpdater maxZoom={layer.maxZoom} />
        <ClickHandler onClick={onSelectPoint} />
        <FlyTo target={flyTarget} />
        {parcelGeometry && (
          <GeoJSON
            key={parcelKey}
            data={parcelGeometry}
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

      <div className="absolute bottom-6 left-4 z-[1000] flex items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-gray-300 bg-white shadow-md">
          {(Object.keys(BASE_LAYERS) as BaseLayerId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setBaseLayer(id)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                baseLayer === id
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {BASE_LAYERS[id].label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowZones((v) => !v)}
          title="Bauzonen (harmonisiert) als halbtransparente Ebene einblenden"
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium shadow-md transition-colors ${
            showZones
              ? 'border-red-700 bg-red-700 text-white'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          Zonen
        </button>
      </div>
    </>
  );
}
