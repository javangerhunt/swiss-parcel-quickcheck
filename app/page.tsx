'use client';

import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import type { FlyTarget } from '@/components/Map';
import { SearchBar } from '@/components/SearchBar';
import { ParcelPanel } from '@/components/ParcelPanel';
import { WatchlistPanel } from '@/components/WatchlistPanel';
import { CompareModal } from '@/components/CompareModal';
import { useParcelData } from '@/hooks/useParcelData';
import { useDenkmalschutz } from '@/hooks/useDenkmalschutz';
import { useWatchlist } from '@/hooks/useWatchlist';
import type { SearchResult, WatchlistEntry } from '@/types/parcel';

// Leaflet needs `window`, so the map is only rendered client-side.
const MapView = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-gray-100 text-sm text-gray-500">
      Karte wird geladen…
    </div>
  ),
});

type SidebarTab = 'parcel' | 'watchlist';

export default function Home() {
  const { status, parcel, zone, error, loadParcel } = useParcelData();
  const denkmalStatus = useDenkmalschutz(parcel?.lv95 ?? null);
  const { watchlist, add, remove, updateNotes, isStarred } = useWatchlist();
  const [activeTab, setActiveTab] = useState<SidebarTab>('parcel');
  const [compareOpen, setCompareOpen] = useState(false);
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<{ lat: number; lon: number } | null>(null);
  const flyKey = useRef(0);

  const flyTo = (lat: number, lon: number) => {
    setFlyTarget({ lat, lon, zoom: 17, key: ++flyKey.current });
  };

  const handleMapClick = (lat: number, lon: number) => {
    setSelectedPoint({ lat, lon });
    setActiveTab('parcel');
    loadParcel(lat, lon);
  };

  const handleSearchSelect = (result: SearchResult) => {
    setSelectedPoint({ lat: result.lat, lon: result.lon });
    setActiveTab('parcel');
    flyTo(result.lat, result.lon);
    loadParcel(result.lat, result.lon);
  };

  const handleWatchlistFlyTo = (entry: WatchlistEntry) => {
    setCompareOpen(false);
    setSelectedPoint({ lat: entry.lat, lon: entry.lon });
    setActiveTab('parcel');
    flyTo(entry.lat, entry.lon);
    loadParcel(entry.lat, entry.lon);
  };

  const handleToggleStar = () => {
    if (!parcel) return;
    if (isStarred(parcel.egrid)) {
      remove(parcel.egrid);
    } else {
      add({
        egrid: parcel.egrid,
        label: parcel.label,
        areaM2: parcel.areaM2,
        zone: zone ?? 'Zone n/a',
        lat: parcel.lat,
        lon: parcel.lon,
        denkmalschutz:
          denkmalStatus === 'isos' || denkmalStatus === 'kgs' || denkmalStatus === 'both',
        addedAt: new Date().toISOString(),
      });
    }
  };

  const tabClass = (tab: SidebarTab) =>
    `flex-1 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
      activeTab === tab
        ? 'border-gray-900 text-gray-900'
        : 'border-transparent text-gray-400 hover:text-gray-600'
    }`;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <h1 className="text-base font-semibold text-gray-900">
          🏠 Swiss Parcel Quick-Check
        </h1>
        <button
          type="button"
          onClick={() => setActiveTab('watchlist')}
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          Watchlist ({watchlist.length}) ★
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="relative min-h-0 flex-1">
          <SearchBar onSelect={handleSearchSelect} />
          <MapView
            onSelectPoint={handleMapClick}
            flyTarget={flyTarget}
            parcelGeometry={parcel?.geometryWgs84 ?? null}
            parcelKey={parcel?.egrid ?? 'none'}
            selectedPoint={selectedPoint}
          />
        </div>

        <aside className="flex max-h-[45dvh] w-full flex-col border-t border-gray-200 bg-white md:max-h-none md:w-96 md:border-l md:border-t-0">
          <nav className="flex shrink-0 border-b border-gray-200">
            <button type="button" onClick={() => setActiveTab('parcel')} className={tabClass('parcel')}>
              Parzelle
            </button>
            <button type="button" onClick={() => setActiveTab('watchlist')} className={tabClass('watchlist')}>
              Watchlist ({watchlist.length})
            </button>
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {activeTab === 'parcel' ? (
              <ParcelPanel
                status={status}
                parcel={parcel}
                zone={zone}
                error={error}
                denkmalStatus={denkmalStatus}
                starred={parcel ? isStarred(parcel.egrid) : false}
                onToggleStar={handleToggleStar}
              />
            ) : (
              <WatchlistPanel
                entries={watchlist}
                onFlyTo={handleWatchlistFlyTo}
                onRemove={remove}
                onUpdateNotes={updateNotes}
                onOpenCompare={() => setCompareOpen(true)}
              />
            )}
          </div>
        </aside>
      </div>

      {compareOpen && (
        <CompareModal
          entries={watchlist}
          onClose={() => setCompareOpen(false)}
          onFlyTo={handleWatchlistFlyTo}
        />
      )}
    </div>
  );
}
