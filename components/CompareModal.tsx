'use client';

import { useEffect } from 'react';
import { formatSwissNumber } from '@/lib/format';
import type { WatchlistEntry } from '@/types/parcel';

interface CompareModalProps {
  entries: WatchlistEntry[];
  onClose: () => void;
  onFlyTo: (entry: WatchlistEntry) => void;
}

const dateFormat = new Intl.DateTimeFormat('de-CH', { dateStyle: 'medium' });

/** Full-screen side-by-side comparison of all watchlist parcels. */
export function CompareModal({ entries, onClose, onFlyTo }: CompareModalProps) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85dvh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-base font-semibold text-gray-900">
            Parzellenvergleich ({entries.length})
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            title="Schliessen (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="overflow-auto p-5">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white p-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                  &nbsp;
                </th>
                {entries.map((entry) => (
                  <th
                    key={entry.egrid}
                    className="min-w-44 border-b border-gray-200 p-2 text-left font-semibold text-gray-900"
                  >
                    {entry.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="sticky left-0 bg-white p-2 text-xs text-gray-500">Fläche</td>
                {entries.map((entry) => (
                  <td key={entry.egrid} className="border-b border-gray-100 p-2 font-medium">
                    {entry.areaM2 > 0 ? `${formatSwissNumber(entry.areaM2)} m²` : 'n/a'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="sticky left-0 bg-white p-2 text-xs text-gray-500">Zone</td>
                {entries.map((entry) => (
                  <td key={entry.egrid} className="border-b border-gray-100 p-2">
                    {entry.zone}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="sticky left-0 bg-white p-2 text-xs text-gray-500">
                  Denkmalschutz
                </td>
                {entries.map((entry) => (
                  <td key={entry.egrid} className="border-b border-gray-100 p-2">
                    {entry.denkmalschutz ? (
                      <span className="text-orange-700">⚠ ja</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="sticky left-0 bg-white p-2 text-xs text-gray-500">EGRID</td>
                {entries.map((entry) => (
                  <td
                    key={entry.egrid}
                    className="border-b border-gray-100 p-2 font-mono text-xs"
                  >
                    {entry.egrid}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="sticky left-0 bg-white p-2 text-xs text-gray-500">
                  Hinzugefügt
                </td>
                {entries.map((entry) => (
                  <td key={entry.egrid} className="border-b border-gray-100 p-2 text-xs">
                    {dateFormat.format(new Date(entry.addedAt))}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="sticky left-0 bg-white p-2 align-top text-xs text-gray-500">
                  Notizen
                </td>
                {entries.map((entry) => (
                  <td
                    key={entry.egrid}
                    className="max-w-56 border-b border-gray-100 p-2 align-top text-xs text-gray-600"
                  >
                    {entry.notes?.trim() || <span className="text-gray-300">—</span>}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="sticky left-0 bg-white p-2"></td>
                {entries.map((entry) => (
                  <td key={entry.egrid} className="p-2">
                    <button
                      type="button"
                      onClick={() => onFlyTo(entry)}
                      className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
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
