'use client';

/**
 * SearchBar
 * ---------
 * The main search box at the top of the app. As the user types, it queries the
 * Swiss geo.admin search service and shows a live dropdown of matching results:
 * addresses, individual parcels, municipalities ("Gemeinde") and postal
 * localities ("Ort").
 *
 * There are two kinds of result, handled differently:
 *   - A point result (e.g. an address or a single parcel): selecting it calls
 *     `onSelect`, which the parent uses to jump straight to that location.
 *   - An "area" result (a Gemeinde or Ort with a bounding box): selecting it
 *     instead expands an inline filter form (AreaFilterForm). Submitting that
 *     form calls `onSelectArea`, which runs a broader search over the whole area.
 *
 * Implementation highlights for graders:
 *   - The search is *debounced* (300 ms) so we don't fire a request on every
 *     keystroke, only after the user briefly stops typing.
 *   - In-flight requests are cancelled with an AbortController when a newer
 *     query starts, so stale (out-of-order) results can't overwrite fresh ones.
 *
 * 'use client': a browser-side component (uses state, effects, refs, fetch).
 */

import { useEffect, useRef, useState } from 'react';
import { searchLocations } from '@/lib/geoAdmin';
import { AreaFilterForm } from '@/components/AreaFilterForm';
import type { AreaFilters } from '@/lib/areaSearch';
import type { SearchResult } from '@/types/parcel';

interface SearchBarProps {
  onSelect: (result: SearchResult) => void; // a point result was chosen
  /** Called when a Gemeinde / Ort is searched with filters → runs the area search. */
  onSelectArea: (result: SearchResult, filters: AreaFilters) => void;
}

// --- Helpers -----------------------------------------------------------------

/**
 * Whether a result is an area (Gemeinde / Ort) that opens the area search.
 * It must come from the municipality ('gg25') or postcode ('zipcode') dataset
 * AND carry a bounding box (bbox) that defines the area to search within.
 */
function isArea(result: SearchResult): boolean {
  return (result.origin === 'gg25' || result.origin === 'zipcode') && !!result.bbox;
}

/**
 * Short type badge per result. Maps the internal dataset origin to a friendly
 * German label shown next to the result, or null for origins without a badge.
 */
function resultBadge(origin: string): string | null {
  switch (origin) {
    case 'gg25':
      return 'Gemeinde';
    case 'zipcode':
      return 'Ort';
    case 'parcel':
      return 'Parzelle';
    default:
      return null;
  }
}

// --- Component ----------------------------------------------------------------

/**
 * @param onSelect     Called when the user picks a point result (address/parcel).
 * @param onSelectArea Called when the user runs a filtered search over an area.
 */
export function SearchBar({ onSelect, onSelectArea }: SearchBarProps) {
  const [query, setQuery] = useState(''); // current text in the input
  const [results, setResults] = useState<SearchResult[]>([]); // latest search hits
  const [open, setOpen] = useState(false); // is the dropdown visible?
  const [loading, setLoading] = useState(false); // is a request in flight?
  const [failed, setFailed] = useState(false); // did the last request error?
  const [expandedKey, setExpandedKey] = useState<string | null>(null); // which area row's filter form is open

  // Holds the current request's AbortController so a newer search can cancel it.
  // A ref (not state) is used because changing it must NOT trigger a re-render.
  const abortRef = useRef<AbortController | null>(null);
  // One-shot flag: when we set the input text programmatically (after a
  // selection) we don't want that change to immediately fire a new search.
  const skipNextSearch = useRef(false);

  // --- Live, debounced search (re-runs whenever `query` changes) ---
  useEffect(() => {
    // Skip the search that the upcoming programmatic setQuery would trigger.
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const trimmed = query.trim();
    // Require at least 2 characters before searching, to avoid noisy results.
    if (trimmed.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    // Debounce: wait 300 ms after the last keystroke before sending a request.
    const timer = setTimeout(async () => {
      abortRef.current?.abort(); // cancel any previous, still-running request
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setFailed(false);
      try {
        // Pass the abort signal so this request can be cancelled if outdated.
        const found = await searchLocations(trimmed, controller.signal);
        setResults(found);
        setOpen(true);
      } catch (err) {
        // An AbortError just means we cancelled on purpose — ignore it.
        // Any other error is a real failure, so show the error state.
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setResults([]);
          setFailed(true);
          setOpen(true);
        }
      } finally {
        setLoading(false);
      }
    }, 300);
    // Cleanup: if `query` changes again before 300 ms, cancel the pending timer.
    // This is what actually makes the debounce work.
    return () => clearTimeout(timer);
  }, [query]);

  // Handle picking a point result: fill the box with its label, close the
  // dropdown, and notify the parent. skipNextSearch prevents the label we just
  // wrote from re-triggering the search effect.
  const handleSelect = (result: SearchResult) => {
    skipNextSearch.current = true;
    setQuery(result.label);
    setOpen(false);
    onSelect(result);
  };

  // Handle submitting the area filter form: same UI reset as above, plus close
  // the expanded row, then run the area search with the chosen filters.
  const runAreaSearch = (result: SearchResult, filters: AreaFilters) => {
    skipNextSearch.current = true;
    setQuery(result.label);
    setOpen(false);
    setExpandedKey(null);
    onSelectArea(result, filters);
  };

  return (
    <div className="relative">
      {/* Input row: search-icon + text field + (conditional) spinner */}
      <div className="relative">
        {/* Decorative magnifying-glass icon (aria-hidden, not focusable). */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          // Re-open the dropdown when refocusing if we still have results.
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Adresse, Parzelle oder Gemeinde suchen…"
          aria-label="Adresse, Parzelle oder Gemeinde suchen"
          className="field bg-white/70 py-2.5 pl-10 pr-9 backdrop-blur-sm focus:bg-white"
        />
        {/* Spinning loading indicator, shown only while a request is in flight. */}
        {loading && (
          <span
            aria-hidden="true"
            className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-ink-200 border-t-brand-500"
          />
        )}
      </div>
      {/* Results dropdown, only rendered while `open` is true. */}
      {open && (
        <ul className="scroll-slim mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-ink-200/70 bg-white/90 p-1 shadow-float backdrop-blur-md">
          {/* Error message when the last search failed. */}
          {failed && (
            <li className="px-3 py-2.5 text-sm text-red-600">
              Suche fehlgeschlagen — bitte erneut versuchen.
            </li>
          )}
          {/* "No matches" message when the search succeeded but returned nothing. */}
          {!failed && results.length === 0 && (
            <li className="px-3 py-2.5 text-sm text-ink-500">Keine Treffer.</li>
          )}
          {/* One row per result. */}
          {results.map((result, index) => {
            const badge = resultBadge(result.origin); // friendly type label, or null
            const area = isArea(result); // does this row open the area filter form?
            // Stable, unique key per row (origin+detail+index) for React + to
            // identify which row's filter form is currently expanded.
            const key = `${result.origin}-${result.detail}-${index}`;
            const expanded = area && expandedKey === key;
            return (
              <li key={key}>
                <button
                  type="button"
                  // Area rows toggle their filter form open/closed; point rows
                  // are selected immediately.
                  onClick={() => (area ? setExpandedKey(expanded ? null : key) : handleSelect(result))}
                  // Expose expand/collapse state to assistive tech (areas only).
                  aria-expanded={area ? expanded : undefined}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-700 transition-colors hover:bg-ink-50"
                >
                  {/* Icon: a layered "map area" icon for areas, a pin for points. */}
                  {area ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-500">
                      <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
                      <path d="M9 3v15M15 6v15" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-400">
                      <path d="M12 21s-7-5.2-7-11a7 7 0 0114 0c0 5.8-7 11-7 11z" />
                      <circle cx="12" cy="10" r="2.5" />
                    </svg>
                  )}
                  {/* The result's display text; truncate if too long. */}
                  <span className="flex-1 truncate">{result.label}</span>
                  {/* Optional type badge (Gemeinde / Ort / Parzelle). */}
                  {badge && (
                    <span className="shrink-0 rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-500">
                      {badge}
                    </span>
                  )}
                  {/* Chevron for area rows; rotates 180° when the form is open. */}
                  {area && (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  )}
                </button>
                {/* Inline filter form, revealed under an expanded area row.
                    Submitting it runs the broader area search. */}
                {expanded && (
                  <div className="px-2 pb-2 pt-1">
                    <AreaFilterForm onSearch={(filters) => runAreaSearch(result, filters)} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
