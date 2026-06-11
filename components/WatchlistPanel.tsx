'use client';

import { useState } from 'react';
import { formatSwissNumber } from '@/lib/format';
import type { WatchlistEntry } from '@/types/parcel';

type SortKey = 'newest' | 'areaDesc' | 'areaAsc' | 'zone' | 'label';

const SORT_OPTIONS: Record<SortKey, { label: string; compare: (a: WatchlistEntry, b: WatchlistEntry) => number }> = {
  newest: {
    label: 'Neueste zuerst',
    compare: (a, b) => b.addedAt.localeCompare(a.addedAt),
  },
  areaDesc: {
    label: 'Fläche (gross → klein)',
    compare: (a, b) => b.areaM2 - a.areaM2,
  },
  areaAsc: {
    label: 'Fläche (klein → gross)',
    compare: (a, b) => a.areaM2 - b.areaM2,
  },
  zone: {
    label: 'Zone (A–Z)',
    compare: (a, b) => a.zone.localeCompare(b.zone, 'de'),
  },
  label: {
    label: 'Name (A–Z)',
    compare: (a, b) => a.label.localeCompare(b.label, 'de'),
  },
};

interface WatchlistPanelProps {
  entries: WatchlistEntry[];
  onFlyTo: (entry: WatchlistEntry) => void;
  onRemove: (egrid: string) => void;
  onUpdateNotes: (egrid: string, notes: string) => void;
  onOpenCompare: () => void;
}

function exportCsv(entries: WatchlistEntry[]) {
  const header = [
    'EGRID',
    'Bezeichnung',
    'Flaeche_m2',
    'Zone',
    'Lat',
    'Lon',
    'Denkmalschutz',
    'Hinzugefuegt',
    'Notizen',
  ];
  const rows = entries.map((e) => [
    e.egrid,
    e.label,
    String(e.areaM2),
    e.zone,
    String(e.lat),
    String(e.lon),
    e.denkmalschutz ? 'ja' : 'nein',
    e.addedAt,
    e.notes ?? '',
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(','))
    .join('\n');
  // BOM so Excel opens the file with correct umlauts
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'parcel-watchlist.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export function WatchlistPanel({
  entries,
  onFlyTo,
  onRemove,
  onUpdateNotes,
  onOpenCompare,
}: WatchlistPanelProps) {
  const [sortKey, setSortKey] = useState<SortKey>('newest');

  if (entries.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Noch keine Parzellen gespeichert. Markieren Sie eine Parzelle mit ☆, um sie
        hier abzulegen.
      </p>
    );
  }

  const sorted = [...entries].sort(SORT_OPTIONS[sortKey].compare);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <select
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as SortKey)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-gray-500"
        >
          {(Object.keys(SORT_OPTIONS) as SortKey[]).map((key) => (
            <option key={key} value={key}>
              {SORT_OPTIONS[key].label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onOpenCompare}
          disabled={entries.length < 2}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          title={
            entries.length < 2
              ? 'Mindestens zwei Parzellen für einen Vergleich speichern'
              : 'Alle gespeicherten Parzellen nebeneinander vergleichen'
          }
        >
          ⊞ Vergleichen
        </button>
      </div>

      <ul className="space-y-3">
        {sorted.map((entry) => (
          <li key={entry.egrid} className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                onClick={() => onFlyTo(entry)}
                className="text-left text-sm font-medium text-gray-900 hover:text-red-700"
                title="Auf der Karte anzeigen"
              >
                {entry.label}
              </button>
              <button
                type="button"
                onClick={() => onRemove(entry.egrid)}
                className="shrink-0 text-sm text-gray-400 hover:text-red-600"
                title="Von der Watchlist entfernen"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {entry.areaM2 > 0 ? `${formatSwissNumber(entry.areaM2)} m² · ` : ''}
              {entry.zone}
              {entry.denkmalschutz && (
                <span className="ml-1 text-orange-700">· ⚠ Denkmalschutz</span>
              )}
            </p>
            <textarea
              key={entry.egrid}
              defaultValue={entry.notes ?? ''}
              onBlur={(event) => onUpdateNotes(entry.egrid, event.target.value)}
              placeholder="Notizen…"
              rows={1}
              className="mt-2 w-full resize-y rounded border border-gray-200 px-2 py-1 text-xs outline-none placeholder:text-gray-300 focus:border-gray-400"
            />
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => exportCsv(sorted)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        ⬇ Export CSV
      </button>
    </div>
  );
}
