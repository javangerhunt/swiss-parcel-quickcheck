'use client';

/**
 * Home — the single page and central orchestrator of the whole app.
 *
 * This is the only real "page" in the Next.js app. It owns the high-level state
 * and wires every piece together: the map, the search bar, the four side panels
 * (parcel details, watchlist, owner list, area search) and the compare modal.
 * The visual building blocks and the data-fetching logic live elsewhere; this
 * file decides WHAT is shown and HOW the parts react to each other.
 *
 * Where the state comes from (custom hooks):
 *   - useParcelData    : loads the parcel at a clicked/searched point (status +
 *                        data + the harmonized federal zone).
 *   - useDenkmalschutz : checks national heritage inventories (ISOS / KGS) for
 *                        that parcel. ISOS = protected townscapes, KGS = cultural
 *                        property objects.
 *   - useExactZone     : fetches the precise cantonal zone from the OEREB cadastre
 *                        (OEREB = the public-law restrictions register); slower,
 *                        so it arrives separately.
 *   - useWatchlist     : the user's saved parcels, persisted in the browser
 *                        (localStorage), with add/remove/comment helpers.
 *
 * Two recurring patterns worth knowing while reading this file:
 *   1) Panel switching: a single `panel` state string ('none' | 'parcel' |
 *      'watchlist' | 'owners' | 'search') decides which sidebar is open; the JSX
 *      near the bottom renders exactly one panel based on it.
 *   2) "Fly" / "focus" triggers: to animate the map we pass it an object carrying
 *      a monotonically increasing `key`. Bumping the key re-triggers the map's
 *      effect even when the coordinates are identical (React would otherwise skip
 *      an unchanged value).
 *
 * 'use client': this page runs in the browser (it uses React state, effects and
 * the Leaflet map).
 */

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FlyTarget, OwnerFocus, OwnerShape } from '@/components/Map';
import { SearchBar } from '@/components/SearchBar';
import { ParcelPanel } from '@/components/ParcelPanel';
import { WatchlistPanel } from '@/components/WatchlistPanel';
import { OwnerListPanel } from '@/components/OwnerListPanel';
import { AreaSearchPanel, type AreaSearchRequest } from '@/components/AreaSearchPanel';
import { CompareModal } from '@/components/CompareModal';
import type { AreaFilters } from '@/lib/areaSearch';
import { useParcelData } from '@/hooks/useParcelData';
import { useDenkmalschutz } from '@/hooks/useDenkmalschutz';
import { useExactZone } from '@/hooks/useExactZone';
import { useWatchlist } from '@/hooks/useWatchlist';
import { buildOwnerGroups, entryOwnerInfo, ownerInfoToString, ownerKey } from '@/lib/owners';
import { formatExactZones } from '@/lib/oereb';
import { fetchParcel } from '@/lib/geoAdmin';
import type { OwnerInfo, SearchResult, WatchlistEntry } from '@/types/parcel';

// Leaflet needs `window`, so the map is only rendered client-side.
const MapView = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-ink-100 text-sm text-ink-500">
      Karte wird geladen…
    </div>
  ),
});

// The identity of the side panel currently open (or 'none' for just the map).
// A string union (rather than free text) lets TypeScript guarantee every place
// that reads/writes `panel` uses one of these exact values.
type PanelId = 'none' | 'parcel' | 'watchlist' | 'owners' | 'search';

export default function Home() {
  const { status, parcel, zone, error, loadParcel } = useParcelData();
  const denkmalStatus = useDenkmalschutz(parcel?.lv95 ?? null);
  const exactZone = useExactZone(parcel?.canton ?? null, parcel?.egrid ?? null);
  const exactZoneText = formatExactZones(exactZone.zones) || null;
  const {
    watchlist,
    add,
    remove,
    updateEntry,
    addComment,
    updateComment,
    removeComment,
    isStarred,
    getEntry,
  } = useWatchlist();
  // Which side panel is open. 'none' keeps the map full-width; the parcel
  // panel opens on a map click / search, the watchlist via the header button.
  const [panel, setPanel] = useState<PanelId>('none');
  const [compareOpen, setCompareOpen] = useState(false); // is the compare modal open?
  // The current "fly the map here" request (null = no pending animation). The map
  // animates whenever this object's `key` changes (see flyTo below).
  const [flyTarget, setFlyTarget] = useState<FlyTarget | null>(null);
  // The point the user last clicked/selected, drawn as a red dot on the map.
  const [selectedPoint, setSelectedPoint] = useState<{ lat: number; lon: number } | null>(null);
  // Ever-increasing counter so two consecutive fly-to's to the same coordinates
  // still produce two distinct `key`s and therefore two animations.
  const flyKey = useRef(0);

  // Ask the map to smoothly pan/zoom to a point. Bumping flyKey guarantees a new
  // `key`, which is what the map watches to (re)trigger the animation.
  const flyTo = (lat: number, lon: number) => {
    setFlyTarget({ lat, lon, zoom: 17, key: ++flyKey.current });
  };

  // A plain click on the map: remember the point, open the parcel panel and look
  // up the parcel that lies under the click.
  const handleMapClick = (lat: number, lon: number) => {
    setSelectedPoint({ lat, lon });
    setPanel('parcel');
    loadParcel(lat, lon);
  };

  // Picking a point result from the search box: like a map click, but we also
  // fly the map to the chosen location first.
  const handleSearchSelect = (result: SearchResult) => {
    setSelectedPoint({ lat: result.lat, lon: result.lon });
    setPanel('parcel');
    flyTo(result.lat, result.lon);
    loadParcel(result.lat, result.lon);
  };

  // The active "search every parcel in this area" request (null = none yet).
  const [areaSearch, setAreaSearch] = useState<AreaSearchRequest | null>(null);
  const areaKeyRef = useRef(0); // counter so re-searching the same area re-runs it

  // Picking a Gemeinde/Ort area + filters from the search box: kick off the area
  // search panel for that bounding box, and fly the map to the area's centre.
  // (Gemeinde = Swiss political municipality.)
  const handleSelectArea = (result: SearchResult, filters: AreaFilters) => {
    if (!result.bbox) return;
    setAreaSearch({
      label: result.label,
      bbox: result.bbox,
      filters,
      key: ++areaKeyRef.current,
    });
    setPanel('search');
    flyTo(result.lat, result.lon);
  };

  // Clicking a saved parcel anywhere (watchlist, owner list, compare modal):
  // close the modal if open, then open and load that parcel like a normal click.
  const handleWatchlistFlyTo = (entry: WatchlistEntry) => {
    setCompareOpen(false);
    setSelectedPoint({ lat: entry.lat, lon: entry.lon });
    setPanel('parcel');
    flyTo(entry.lat, entry.lon);
    loadParcel(entry.lat, entry.lon);
  };

  // Build a complete watchlist entry from the currently loaded parcel.
  const makeEntry = (overrides?: Partial<WatchlistEntry>): WatchlistEntry | null => {
    if (!parcel) return null;
    return {
      egrid: parcel.egrid,
      number: parcel.number,
      label: parcel.label,
      areaM2: parcel.areaM2,
      zone: zone ?? 'Zone n/a',
      exactZone: exactZoneText ?? undefined,
      address: parcel.address ?? undefined,
      plz: parcel.plz ?? undefined,
      place: parcel.place ?? undefined,
      gemeinde: parcel.gemeinde ?? undefined,
      lat: parcel.lat,
      lon: parcel.lon,
      geometry: parcel.geometryWgs84 ?? null,
      denkmalschutz:
        denkmalStatus === 'isos' || denkmalStatus === 'kgs' || denkmalStatus === 'both',
      addedAt: new Date().toISOString(),
      comments: [],
      ...overrides,
    };
  };

  // Star button: if already saved, remove it; otherwise build a fresh watchlist
  // entry from the loaded parcel and add it.
  const handleToggleStar = () => {
    if (!parcel) return;
    if (isStarred(parcel.egrid)) {
      remove(parcel.egrid);
    } else {
      const entry = makeEntry();
      if (entry) add(entry);
    }
  };

  // Owner edits auto-save: update the existing entry, or add the parcel to the
  // watchlist (with the new value) if it isn't starred yet. The structured
  // details are stored as `ownerInfo`; `owner` is the derived string used for
  // grouping / colouring / export.
  const handleOwnerInfoChange = (info: OwnerInfo) => {
    if (!parcel) return;
    const owner = ownerInfoToString(info);
    const patch: Partial<WatchlistEntry> = { ownerInfo: info, owner };
    if (isStarred(parcel.egrid)) {
      updateEntry(parcel.egrid, patch);
    } else if (owner.trim() !== '') {
      const entry = makeEntry(patch);
      if (entry) add(entry);
    }
  };

  // Posting a comment auto-adds the parcel to the watchlist first (if needed),
  // then appends the comment. Both updates are functional, so the comment lands
  // on the freshly added entry even though `isStarred` is still stale here.
  const handlePostComment = (text: string) => {
    if (!parcel || text.trim() === '') return;
    if (!isStarred(parcel.egrid)) {
      const entry = makeEntry();
      if (entry) add(entry);
    }
    addComment(parcel.egrid, text);
  };

  // Backfill missing geometry (and location fields) for parcels that were
  // starred before those fields were stored — otherwise they can't be coloured
  // on the owner map. Runs when a starred parcel is (re)opened.
  useEffect(() => {
    if (!parcel) return;
    const entry = getEntry(parcel.egrid);
    if (entry && !entry.geometry && parcel.geometryWgs84) {
      updateEntry(parcel.egrid, {
        geometry: parcel.geometryWgs84,
        number: entry.number ?? parcel.number,
        address: entry.address ?? parcel.address ?? undefined,
        plz: entry.plz ?? parcel.plz ?? undefined,
        place: entry.place ?? parcel.place ?? undefined,
        gemeinde: entry.gemeinde ?? parcel.gemeinde ?? undefined,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcel?.egrid]);

  // Background-hydrate outlines for any watchlist parcels missing one (e.g.
  // starred before outlines were stored, or whose owner was set from the list
  // without ever opening them) so every parcel can be coloured on the map.
  const hydratedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    watchlist.forEach((entry) => {
      if (entry.geometry || hydratedRef.current.has(entry.egrid)) return;
      hydratedRef.current.add(entry.egrid);
      (async () => {
        try {
          const raw = await fetchParcel(entry.lat, entry.lon);
          if (raw?.geometryWgs84) {
            updateEntry(entry.egrid, {
              geometry: raw.geometryWgs84,
              number: entry.number ?? raw.number,
            });
          }
        } catch {
          // Leave it uncoloured; it will be retried next session.
        }
      })();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist]);

  // The exact zone arrives asynchronously (after the geometry backfill above),
  // so sync it into the starred entry once it has loaded.
  useEffect(() => {
    if (!parcel || !exactZoneText) return;
    const entry = getEntry(parcel.egrid);
    if (entry && entry.exactZone !== exactZoneText) {
      updateEntry(parcel.egrid, { exactZone: exactZoneText });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcel?.egrid, exactZoneText]);

  // Owner colour groups across the whole watchlist, and the shapes + legend the
  // map needs to colour each parcel by its owner.
  const ownerGroups = useMemo(() => buildOwnerGroups(watchlist), [watchlist]);

  const ownerShapes = useMemo<OwnerShape[]>(
    () =>
      watchlist
        .filter((e) => e.geometry)
        .map((e) => {
          const key = ownerKey(e.owner);
          return {
            egrid: e.egrid,
            geometry: e.geometry!,
            ownerKey: key,
            color: (key && ownerGroups.get(key)?.color) || null,
          };
        }),
    [watchlist, ownerGroups]
  );

  const ownerLegend = useMemo(
    () =>
      Array.from(ownerGroups.values()).sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'de')
      ),
    [ownerGroups]
  );

  // Distinct existing owners, offered as a picker so the same owner can be
  // reused verbatim (guaranteeing the parcels group together).
  const knownOwners = useMemo(
    () => ownerLegend.map((g) => ({ color: g.color, info: g.info })),
    [ownerLegend]
  );

  // Which owner's parcels are highlighted + zoomed-to on the map (null = none).
  // Like flyTarget, it carries a bumping `key` so re-selecting the same owner
  // re-triggers the map's "fit to all their parcels" animation.
  const [ownerFocus, setOwnerFocus] = useState<OwnerFocus | null>(null);
  const focusKeyRef = useRef(0);
  const handleFocusOwner = (key: string) => {
    setOwnerFocus({ ownerKey: key, key: ++focusKeyRef.current });
  };

  // Same-owner siblings of the currently loaded parcel (for the popup link).
  const currentEntry = parcel ? getEntry(parcel.egrid) : undefined;
  const currentOwnerInfo: OwnerInfo = currentEntry ? entryOwnerInfo(currentEntry) : {};
  const currentOwner = currentEntry?.owner;
  const currentOwnerKey = ownerKey(currentOwner);
  const ownerSiblings = currentOwnerKey
    ? watchlist.filter(
        (e) => e.egrid !== parcel?.egrid && ownerKey(e.owner) === currentOwnerKey
      )
    : [];
  const currentOwnerColor =
    (currentOwnerKey && ownerGroups.get(currentOwnerKey)?.color) || null;

  // Heading shown at the top of the open side panel (with a live count where it
  // makes sense), chosen from the active `panel`.
  const panelTitle =
    panel === 'watchlist'
      ? `Watchlist (${watchlist.length})`
      : panel === 'owners'
      ? `Eigentümer (${ownerLegend.length})`
      : panel === 'search'
      ? 'Parzellensuche'
      : 'Parzelle';

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-canvas">
      {/* Full-bleed map fills the entire viewport. */}
      <div className="absolute inset-0">
        <MapView
          onSelectPoint={handleMapClick}
          flyTarget={flyTarget}
          parcelGeometry={parcel?.geometryWgs84 ?? null}
          parcelKey={parcel?.egrid ?? 'none'}
          selectedPoint={selectedPoint}
          ownerShapes={ownerShapes}
          selectedEgrid={parcel?.egrid ?? null}
          ownerFocus={ownerFocus}
        />
      </div>

      {/* Top-left: brand wordmark + search, in one floating glass card. */}
      <div className="absolute left-4 top-4 z-[1100] w-[calc(100%-2rem)] max-w-[360px] rounded-2xl border border-ink-200/70 bg-white/80 p-3 shadow-float ring-1 ring-black/5 backdrop-blur-md md:w-[360px]">
        <div className="mb-2.5 flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[18px] w-[18px]"
            >
              <path d="M4 5l5.5-2 5 2L20 3v16l-5.5 2-5-2L4 21z" />
              <path d="M9.5 3v16M14.5 5v16" />
            </svg>
          </span>
          <div className="flex min-w-0 flex-col leading-none">
            <h1 className="truncate text-[15px] font-semibold tracking-tight text-ink-900">
              Swiss Parcel <span className="text-brand-600">Quick-Check</span>
            </h1>
            <p className="mt-0.5 text-[11px] font-medium text-ink-400">
              Parzellen-Recherche · Kanton Zug
            </p>
          </div>
        </div>
        <SearchBar onSelect={handleSearchSelect} onSelectArea={handleSelectArea} />
      </div>

      {/* Top-right: Eigentümer + Watchlist toggles as glass pills. */}
      <div className="absolute right-4 top-4 z-[1100] flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPanel((p) => (p === 'owners' ? 'none' : 'owners'))}
          aria-pressed={panel === 'owners'}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium shadow-float ring-1 backdrop-blur-md transition-colors duration-150 ${
            panel === 'owners'
              ? 'bg-ink-900/90 text-white ring-black/10'
              : 'bg-white/80 text-ink-700 ring-black/5 hover:bg-white'
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
            <path d="M17 20v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 20v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" />
          </svg>
          Eigentümer
          <span
            className={`ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums ${
              panel === 'owners' ? 'bg-white/20 text-white' : 'bg-ink-100 text-ink-600'
            }`}
          >
            {ownerLegend.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setPanel((p) => (p === 'watchlist' ? 'none' : 'watchlist'))}
          aria-pressed={panel === 'watchlist'}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium shadow-float ring-1 backdrop-blur-md transition-colors duration-150 ${
            panel === 'watchlist'
              ? 'bg-ink-900/90 text-white ring-black/10'
              : 'bg-white/80 text-ink-700 ring-black/5 hover:bg-white'
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            className={`h-3.5 w-3.5 ${panel === 'watchlist' ? 'text-amber-300' : 'text-amber-500'}`}
          >
            <path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.9l-5.8 3.05 1.1-6.46-4.69-4.58 6.49-.94z" />
          </svg>
          Watchlist
          <span
            className={`ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums ${
              panel === 'watchlist' ? 'bg-white/20 text-white' : 'bg-ink-100 text-ink-600'
            }`}
          >
            {watchlist.length}
          </span>
        </button>
      </div>

      {/* Right edge (desktop) / bottom sheet (mobile): the open panel as a
          floating glass card. Sits below the top-right watchlist button. */}
      {panel !== 'none' && (
        <aside className="absolute inset-x-0 bottom-0 z-[1050] flex max-h-[70dvh] flex-col rounded-t-2xl border border-ink-200/70 bg-white/85 shadow-overlay ring-1 ring-black/5 backdrop-blur-md md:inset-x-auto md:bottom-4 md:right-4 md:top-20 md:max-h-none md:w-96 md:rounded-2xl md:shadow-float">
          <div className="flex shrink-0 items-center justify-between border-b border-ink-200/70 px-4 py-3">
            <h2 className="text-sm font-semibold tracking-tight text-ink-900">{panelTitle}</h2>
            <button
              type="button"
              onClick={() => setPanel('none')}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
              aria-label="Panel schliessen"
              title="Schliessen"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="h-4 w-4">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {/* Panel switch: render exactly one panel's body based on `panel`.
              Each panel is fed the relevant slice of state plus the callbacks it
              needs to report user actions back up to this orchestrator. */}
          <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-4">
              {panel === 'search' ? (
                <AreaSearchPanel
                  request={areaSearch}
                  onLoadParcel={(lat, lon) => {
                    setSelectedPoint({ lat, lon });
                    setPanel('parcel');
                    flyTo(lat, lon);
                    loadParcel(lat, lon);
                  }}
                />
              ) : panel === 'owners' ? (
                <OwnerListPanel
                  groups={ownerLegend}
                  entries={watchlist}
                  onFocusOwner={handleFocusOwner}
                  onFlyTo={handleWatchlistFlyTo}
                />
              ) : panel === 'parcel' ? (
                <ParcelPanel
                  status={status}
                  parcel={parcel}
                  zone={zone}
                  exactZoneText={exactZoneText}
                  exactZoneLoading={exactZone.status === 'loading'}
                  error={error}
                  denkmalStatus={denkmalStatus}
                  starred={parcel ? isStarred(parcel.egrid) : false}
                  ownerInfo={currentOwnerInfo}
                  comments={(parcel && getEntry(parcel.egrid)?.comments) || []}
                  ownerColor={currentOwnerColor}
                  ownerSiblings={ownerSiblings}
                  knownOwners={knownOwners}
                  onToggleStar={handleToggleStar}
                  onOwnerInfoChange={handleOwnerInfoChange}
                  onFlyToSibling={handleWatchlistFlyTo}
                  onPostComment={handlePostComment}
                  onEditComment={(id, text) =>
                    parcel && updateComment(parcel.egrid, id, text)
                  }
                  onRemoveComment={(id) => parcel && removeComment(parcel.egrid, id)}
                />
              ) : (
                <WatchlistPanel
                  entries={watchlist}
                  ownerGroups={ownerGroups}
                  ownerLegend={ownerLegend}
                  knownOwners={knownOwners}
                  onFlyTo={handleWatchlistFlyTo}
                  onFocusOwner={handleFocusOwner}
                  onRemove={remove}
                  onUpdateOwnerInfo={(egrid, info) =>
                    updateEntry(egrid, { ownerInfo: info, owner: ownerInfoToString(info) })
                  }
                  onPostComment={addComment}
                  onEditComment={updateComment}
                  onRemoveComment={removeComment}
                  onOpenCompare={() => setCompareOpen(true)}
                />
              )}
            </div>
          </aside>
        )}

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
