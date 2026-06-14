/**
 * AreaSearchPanel — runs an "all parcels in this area" search and lists the hits.
 *
 * Given a search request (a labelled bounding box plus filters), it calls the
 * async searchArea() helper, shows live progress while that runs, then renders
 * the matching parcels as clickable rows. Clicking a row loads that parcel on
 * the map. The search is cancellable: starting a new one (or unmounting) aborts
 * any in-flight request so stale results never overwrite fresh ones.
 */
'use client'; // stateful, async, browser-side component

import { useEffect, useRef, useState } from 'react';
import { searchArea, type AreaFilters, type AreaResult } from '@/lib/areaSearch';
import { formatSwissNumber } from '@/lib/format';

export interface AreaSearchRequest {
  label: string; // human-readable area name, e.g. the Gemeinde
  bbox: [number, number, number, number]; // geographic bounding box to scan
  filters: AreaFilters; // zone / area / year constraints
  /** Monotonic key so the same area+filters re-runs on demand. */
  key: number;
}

interface AreaSearchPanelProps {
  request: AreaSearchRequest | null;
  /** Load a result parcel on the map (switches to the parcel panel). */
  onLoadParcel: (lat: number, lon: number) => void;
}

/**
 * Build a short one-line summary of the active filters for the header,
 * e.g. "Wohnzone · 100–∞ m² · Baujahr 1990–…", or "keine Filter" when none set.
 *
 * @param f the filters to describe
 * @returns the dot-separated summary string
 */
function filterSummary(f: AreaFilters): string {
  const parts: string[] = [];
  if (f.zone) parts.push(f.zone);
  // Only mention area / year when at least one bound is set; a missing bound is
  // shown as an open end (0 / ∞ / …) so the reader sees it's one-sided.
  if (f.minM2 != null || f.maxM2 != null)
    parts.push(`${f.minM2 ?? '0'}–${f.maxM2 ?? '∞'} m²`);
  if (f.minYear != null || f.maxYear != null)
    parts.push(`Baujahr ${f.minYear ?? '…'}–${f.maxYear ?? '…'}`);
  return parts.join(' · ') || 'keine Filter';
}

export function AreaSearchPanel({ request, onLoadParcel }: AreaSearchPanelProps) {
  const [running, setRunning] = useState(false); // true while a search is in progress
  const [progress, setProgress] = useState({ done: 0, total: 0 }); // live "done/total" counter
  const [results, setResults] = useState<AreaResult[] | null>(null); // null = not searched yet
  const [meta, setMeta] = useState<{ scanned: number; capped: boolean } | null>(null); // how many checked / whether area was capped
  const [error, setError] = useState<string | null>(null);
  // Holds the AbortController of the current search so we can cancel it. A ref
  // (not state) is used because changing it must not trigger a re-render.
  const abortRef = useRef<AbortController | null>(null);

  // Re-run the search whenever a new request arrives. Keyed on request.key so an
  // identical area+filters can be searched again on demand (its key bumps).
  useEffect(() => {
    if (!request) return; // nothing to search yet
    abortRef.current?.abort(); // cancel any previous, still-running search
    const controller = new AbortController();
    abortRef.current = controller;
    // Reset UI to a clean "searching" state before kicking off the request.
    setRunning(true);
    setError(null);
    setResults(null);
    setProgress({ done: 0, total: 0 });
    searchArea(request.bbox, request.filters, {
      signal: controller.signal, // lets searchArea bail out when we abort
      onProgress: (done, total) => setProgress({ done, total }), // stream progress to the counter
    })
      .then((outcome) => {
        setResults(outcome.results);
        setMeta({ scanned: outcome.scanned, capped: outcome.capped });
      })
      .catch((err) => {
        // An abort is expected (we cancelled on purpose), so ignore it; only
        // show real failures to the user.
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setError(err instanceof Error ? err.message : 'Suche fehlgeschlagen');
        }
      })
      .finally(() => setRunning(false));
    // Cleanup: if this effect re-runs or the component unmounts, abort the
    // search so a late response can't update an unmounted/stale view.
    return () => controller.abort();
    // Intentionally depend only on request.key (the whole `request` object is a
    // new reference each render, which would re-run the search unnecessarily).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.key]);

  // Empty state: no search has been requested yet, so explain how to start one.
  if (!request) {
    return (
      <p className="text-sm text-ink-500">
        Suchen Sie oben nach einer Gemeinde oder einem Ort, klappen Sie sie mit
        ▾ auf und setzen Sie die Filter, um Parzellen im Gebiet zu suchen.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="eyebrow text-ink-400">Gebiet</p>
        <p className="text-sm font-semibold text-ink-900">{request.label}</p>
        <p className="mt-0.5 text-xs text-ink-500">{filterSummary(request.filters)}</p>
      </div>

      {/* While searching: show "Suche…" plus the progress counter once known. */}
      {running && (
        <p className="text-sm text-ink-500">
          Suche…{progress.total > 0 ? ` ${progress.done}/${progress.total}` : ''}
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Results block: rendered once searchArea has resolved. */}
      {results && (
        <div className="space-y-2">
          {/* Count line, with German singular/plural ("Parzelle" vs "Parzellen")
              and how many parcels were scanned to find them. */}
          <p className="text-xs text-ink-500">
            {results.length} {results.length === 1 ? 'Parzelle' : 'Parzellen'}
            {meta && ` (von ${meta.scanned} geprüft${meta.capped ? ', Gebiet begrenzt' : ''})`}
          </p>
          <ul className="space-y-2">
            {/* One clickable row per matching parcel; keyed by its unique EGRID. */}
            {results.map((r) => (
              <li key={r.egrid}>
                <button
                  type="button"
                  // Clicking a result loads that parcel on the map by coordinates.
                  onClick={() => onLoadParcel(r.lat, r.lon)}
                  className="w-full rounded-lg border border-ink-200 p-2.5 text-left transition-colors hover:bg-ink-50"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-ink-900">
                      {r.number ? `Parz. ${r.number}` : r.egrid}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-ink-500">
                      {r.areaM2 > 0 ? `${formatSwissNumber(r.areaM2)} m²` : '—'}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-500">
                    {[r.zone, r.address, r.baujahr ? `Baujahr ${r.baujahr}` : null]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </p>
                </button>
              </li>
            ))}
            {results.length === 0 && (
              <li className="text-sm text-ink-500">
                Keine Parzellen mit diesen Kriterien gefunden.
              </li>
            )}
          </ul>
          <p className="text-[11px] text-ink-400">
            Findet bebaute Parzellen im Gebiet (Quelle: Gebäuderegister). Bei
            grossen Gemeinden ist das Ergebnis begrenzt und nicht vollständig.
          </p>
        </div>
      )}
    </div>
  );
}
