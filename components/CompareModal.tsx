'use client';

/**
 * CompareModal
 * ------------
 * A pop-up (modal) dialog that lets the user compare several saved parcels
 * side by side. Each saved parcel becomes one column; each property (area,
 * zone, municipality, owner, heritage protection, EGRID, date added, comments)
 * becomes one row. This makes it easy to scan, e.g., "which of these parcels is
 * biggest" or "which one is under heritage protection".
 *
 * The dialog covers the whole screen with a dimmed, blurred backdrop. It can be
 * closed by pressing Escape, clicking the backdrop, or the close button. From
 * each column the user can jump to that parcel on the map (onFlyTo).
 *
 * 'use client' marks this as a browser-side component because it uses React
 * state/effects and listens to keyboard events.
 */

import { useEffect } from 'react';
import { formatSwissNumber } from '@/lib/format';
import type { WatchlistEntry } from '@/types/parcel';

interface CompareModalProps {
  entries: WatchlistEntry[]; // the parcels to compare — one table column each
  onClose: () => void; // called to dismiss the dialog
  onFlyTo: (entry: WatchlistEntry) => void; // called to zoom the map to a parcel
}

// Reusable Swiss-German date formatter (e.g. "14. Juni 2026"). Created once at
// module load rather than on every render, since building it is comparatively costly.
const dateFormat = new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium' });

/** Full-screen side-by-side comparison of all watchlist parcels. */
export function CompareModal({ entries, onClose, onFlyTo }: CompareModalProps) {
  // Close the dialog when the user presses Escape. The effect adds a global
  // keydown listener on mount and removes it again on unmount (the returned
  // cleanup function), so we never leave a dangling listener behind.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    // Full-screen dimmed/blurred backdrop. Clicking it closes the dialog.
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-ink-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* The dialog box itself. stopPropagation() prevents clicks *inside* the
          box from bubbling up to the backdrop and accidentally closing it.
          role/aria-* attributes make the modal accessible to screen readers. */}
      <div
        className="flex max-h-[85dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-overlay"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Parzellenvergleich"
      >
        {/* Header bar: title + a count badge + the close button. */}
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3.5">
          <h2 className="text-base font-semibold tracking-tight text-ink-900">
            Parzellenvergleich
            {/* Small badge showing how many parcels are being compared. */}
            <span className="ml-2 inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-ink-100 px-1.5 text-xs font-semibold tabular-nums text-ink-600">
              {entries.length}
            </span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
            aria-label="Schliessen"
            title="Schliessen (Esc)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="h-4 w-4">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Scrollable comparison table. Layout idea: the first column holds the
            property labels (Fläche, Zone, …) and is "sticky" on the left; the
            header row holds one parcel per column and is "sticky" on top — so
            both stay visible while scrolling a wide/tall table. */}
        <div className="scroll-slim overflow-auto p-5">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                {/* Empty top-left corner cell (above the label column). */}
                <th className="sticky left-0 top-0 z-20 border-b border-ink-200 bg-white p-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                  &nbsp;
                </th>
                {/* One column header per parcel, showing its label. */}
                {entries.map((entry) => (
                  <th
                    key={entry.egrid}
                    className="sticky top-0 z-10 min-w-44 border-b border-ink-200 bg-white p-2.5 text-left font-semibold tracking-tight text-ink-900"
                  >
                    {entry.label}
                  </th>
                ))}
              </tr>
            </thead>
            {/* Each <tr> is one property; the "group" class lets every cell in
                the row highlight together on hover (group-hover:bg-ink-50). */}
            <tbody>
              {/* Area in m², Swiss-formatted, or "n/a" when unknown. */}
              <tr className="group">
                <td className="sticky left-0 bg-white p-2.5 text-[11px] font-medium uppercase tracking-wide text-ink-400 group-hover:bg-ink-50">Fläche</td>
                {entries.map((entry) => (
                  <td key={entry.egrid} className="border-b border-ink-100 p-2.5 font-medium tabular-nums text-ink-900 group-hover:bg-ink-50">
                    {entry.areaM2 > 0 ? `${formatSwissNumber(entry.areaM2)} m²` : 'n/a'}
                  </td>
                ))}
              </tr>
              {/* Zoning classification of each parcel. */}
              <tr className="group">
                <td className="sticky left-0 bg-white p-2.5 text-[11px] font-medium uppercase tracking-wide text-ink-400 group-hover:bg-ink-50">Zone</td>
                {entries.map((entry) => (
                  <td key={entry.egrid} className="border-b border-ink-100 p-2.5 text-ink-800 group-hover:bg-ink-50">
                    {entry.zone}
                  </td>
                ))}
              </tr>
              {/* Municipality, shown as "PLZ Gemeinde" (e.g. "9000 St. Gallen").
                  filter(Boolean) drops a missing postcode or name; if both are
                  missing we show an em dash placeholder. */}
              <tr className="group">
                <td className="sticky left-0 bg-white p-2.5 text-[11px] font-medium uppercase tracking-wide text-ink-400 group-hover:bg-ink-50">Gemeinde</td>
                {entries.map((entry) => (
                  <td key={entry.egrid} className="border-b border-ink-100 p-2.5 text-ink-800 group-hover:bg-ink-50">
                    {[entry.plz, entry.gemeinde].filter(Boolean).join(' ') || (
                      <span className="text-ink-300">—</span>
                    )}
                  </td>
                ))}
              </tr>
              {/* Owner. whitespace-pre-line preserves line breaks in multi-line
                  owner text; an empty/whitespace-only value shows a dash. */}
              <tr className="group">
                <td className="sticky left-0 bg-white p-2.5 align-top text-[11px] font-medium uppercase tracking-wide text-ink-400 group-hover:bg-ink-50">
                  Eigentümer
                </td>
                {entries.map((entry) => (
                  <td
                    key={entry.egrid}
                    className="whitespace-pre-line border-b border-ink-100 p-2.5 align-top text-ink-800 group-hover:bg-ink-50"
                  >
                    {entry.owner?.trim() || <span className="text-ink-300">—</span>}
                  </td>
                ))}
              </tr>
              {/* Heritage protection ("Denkmalschutz"): a warning "⚠ ja" if the
                  parcel is protected, otherwise a neutral dash. */}
              <tr className="group">
                <td className="sticky left-0 bg-white p-2.5 text-[11px] font-medium uppercase tracking-wide text-ink-400 group-hover:bg-ink-50">
                  Denkmalschutz
                </td>
                {entries.map((entry) => (
                  <td key={entry.egrid} className="border-b border-ink-100 p-2.5 group-hover:bg-ink-50">
                    {entry.denkmalschutz ? (
                      <span className="font-medium text-amber-700">⚠ ja</span>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </td>
                ))}
              </tr>
              {/* EGRID: the official Swiss-wide unique identifier of a parcel,
                  shown in a monospace font since it is a code. */}
              <tr className="group">
                <td className="sticky left-0 bg-white p-2.5 text-[11px] font-medium uppercase tracking-wide text-ink-400 group-hover:bg-ink-50">EGRID</td>
                {entries.map((entry) => (
                  <td
                    key={entry.egrid}
                    className="border-b border-ink-100 p-2.5 font-mono text-xs text-ink-600 group-hover:bg-ink-50"
                  >
                    {entry.egrid}
                  </td>
                ))}
              </tr>
              {/* Date the parcel was added to the watchlist. addedAt is stored as
                  a timestamp, so we wrap it in `new Date(...)` before formatting. */}
              <tr className="group">
                <td className="sticky left-0 bg-white p-2.5 text-[11px] font-medium uppercase tracking-wide text-ink-400 group-hover:bg-ink-50">
                  Hinzugefügt
                </td>
                {entries.map((entry) => (
                  <td key={entry.egrid} className="border-b border-ink-100 p-2.5 text-xs tabular-nums text-ink-600 group-hover:bg-ink-50">
                    {dateFormat.format(new Date(entry.addedAt))}
                  </td>
                ))}
              </tr>
              {/* User comments per parcel: a small dated list, or a dash if none.
                  `?? []` defaults to an empty array when comments is undefined. */}
              <tr className="group">
                <td className="sticky left-0 bg-white p-2.5 align-top text-[11px] font-medium uppercase tracking-wide text-ink-400 group-hover:bg-ink-50">
                  Kommentare
                </td>
                {entries.map((entry) => {
                  const comments = entry.comments ?? [];
                  return (
                    <td
                      key={entry.egrid}
                      className="max-w-56 border-b border-ink-100 p-2.5 align-top text-xs text-ink-600 group-hover:bg-ink-50"
                    >
                      {comments.length > 0 ? (
                        <ul className="space-y-1.5">
                          {comments.map((comment) => (
                            <li key={comment.id}>
                              <span className="block text-[10px] tabular-nums text-ink-400">
                                {dateFormat.format(new Date(comment.createdAt))}
                              </span>
                              <span className="whitespace-pre-line">{comment.text}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
              {/* Final action row: a "show on map" button per parcel/column. */}
              <tr>
                <td className="sticky left-0 bg-white p-2.5"></td>
                {entries.map((entry) => (
                  <td key={entry.egrid} className="p-2.5">
                    <button
                      type="button"
                      onClick={() => onFlyTo(entry)}
                      className="btn-secondary px-2.5 py-1.5 text-xs"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
                        <path d="M7 17L17 7M9 7h8v8" />
                      </svg>
                      Auf Karte zeigen
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
