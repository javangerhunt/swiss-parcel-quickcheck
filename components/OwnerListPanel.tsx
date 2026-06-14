'use client';

/**
 * OwnerListPanel
 * --------------
 * Sidebar panel that lists every land owner found across the parcels the user
 * has saved (the "watchlist"). The parcels themselves are grouped by owner
 * beforehand (see {@link OwnerGroup}); this component takes those groups and
 * turns them into a readable, sortable, filterable list.
 *
 * For each owner it shows: the owner's full name/address, how many parcels they
 * own, the total area, the municipalities involved, and small chips for each
 * individual parcel. The user can:
 *   - filter the list by typing part of an owner's name,
 *   - re-sort it (by parcel count, by name, or by total area),
 *   - click an owner to highlight all their parcels on the map (onFocusOwner),
 *   - click a single parcel chip to zoom the map to it (onFlyTo),
 *   - export the whole (currently displayed) list as a CSV or Excel file.
 *
 * It is a "client component" ('use client') because it relies on browser-only
 * features such as React state, file downloads and (lazily) the xlsx library.
 */

import { useState } from 'react';
import { formatSwissNumber } from '@/lib/format';
import { ownerKey, type OwnerGroup } from '@/lib/owners';
import type { WatchlistEntry } from '@/types/parcel';

// --- Types -------------------------------------------------------------------

interface OwnerListPanelProps {
  /** Owner groups (with colour + count), already sorted. */
  groups: OwnerGroup[];
  entries: WatchlistEntry[]; // all saved parcels; we match them back to their owner group
  onFocusOwner: (ownerKey: string) => void; // highlight all of an owner's parcels on the map
  onFlyTo: (entry: WatchlistEntry) => void; // zoom/pan the map to a single parcel
}

/**
 * One fully prepared table row, i.e. an owner plus all the data we want to
 * display or export for them. Building this once up front (see buildRows) keeps
 * the render and the CSV/Excel export reading from the same numbers.
 */
interface OwnerRow {
  group: OwnerGroup;
  parcels: WatchlistEntry[]; // the parcels that belong to this owner
  totalArea: number; // sum of all parcel areas in m²
  numbers: string; // parcel numbers joined as "12, 13, 14"
  gemeinden: string; // distinct municipalities, comma-separated
  zones: string; // distinct zoning labels, semicolon-separated
}

// The four ways the list can be sorted. Using a string union (instead of free
// text) means TypeScript guarantees we only ever sort by a key that exists.
type SortKey = 'countDesc' | 'countAsc' | 'name' | 'areaDesc';

// --- Sorting -----------------------------------------------------------------

/**
 * Lookup table mapping each sort option to (a) a human-readable German label
 * shown in the dropdown and (b) a comparator function used by Array.sort.
 * A comparator returns a negative number if `a` should come before `b`,
 * positive if after, and 0 if their order doesn't matter.
 */

const SORTS: Record<SortKey, { label: string; cmp: (a: OwnerRow, b: OwnerRow) => number }> = {
  countDesc: {
    label: 'Anzahl Parzellen (meiste zuerst)',
    cmp: (a, b) => b.group.count - a.group.count,
  },
  countAsc: {
    label: 'Anzahl Parzellen (wenigste zuerst)',
    cmp: (a, b) => a.group.count - b.group.count,
  },
  name: {
    label: 'Name (A–Z)',
    // localeCompare with 'de' sorts alphabetically using German rules, so
    // umlauts (ä, ö, ü) land in the place a German reader expects.
    cmp: (a, b) => a.group.name.localeCompare(b.group.name, 'de'),
  },
  areaDesc: {
    label: 'Fläche total (gross → klein)',
    cmp: (a, b) => b.totalArea - a.totalArea,
  },
};

// --- Data preparation --------------------------------------------------------

/**
 * Turns the raw owner groups into ready-to-display {@link OwnerRow} objects.
 *
 * For each group we find the matching parcels and pre-compute everything the UI
 * and the export need (total area, parcel numbers, municipalities, zones).
 *
 * @param groups  Owner groups produced upstream (one per distinct owner).
 * @param entries All saved parcels, regardless of owner.
 * @returns One OwnerRow per group, in the same order as `groups`.
 */
function buildRows(groups: OwnerGroup[], entries: WatchlistEntry[]): OwnerRow[] {
  return groups.map((group) => {
    // ownerKey() normalises an owner's text to a stable key, so spelling/spacing
    // differences still match the same group.
    const parcels = entries.filter((e) => ownerKey(e.owner) === group.key);
    return {
      group,
      parcels,
      // Sum the areas; `|| 0` guards against parcels with a missing area.
      totalArea: parcels.reduce((sum, e) => sum + (e.areaM2 || 0), 0),
      // filter(Boolean) drops empty/undefined values before joining.
      numbers: parcels.map((e) => e.number).filter(Boolean).join(', '),
      // `new Set(...)` removes duplicates so each municipality appears once.
      gemeinden: Array.from(new Set(parcels.map((e) => e.gemeinde).filter(Boolean))).join(', '),
      // Prefer the more precise `exactZone`, fall back to the broader `zone`.
      zones: Array.from(new Set(parcels.map((e) => e.exactZone || e.zone).filter(Boolean))).join('; '),
    };
  });
}

// --- Export (CSV / Excel) ----------------------------------------------------

/**
 * Column definitions shared by both the CSV and the Excel export. Each entry
 * pairs a column header with a function that extracts that column's value from
 * an OwnerRow. Defining the columns once keeps both export formats identical.
 */

const EXPORT_COLUMNS: { header: string; value: (r: OwnerRow) => string | number }[] = [
  { header: 'Vorname', value: (r) => r.group.info.vorname ?? '' },
  { header: 'Name', value: (r) => r.group.info.name ?? '' },
  { header: 'Strasse', value: (r) => r.group.info.strasse ?? '' },
  { header: 'PLZ', value: (r) => r.group.info.plz ?? '' },
  { header: 'Ort', value: (r) => r.group.info.ort ?? '' },
  { header: 'Telefon', value: (r) => r.group.info.telefon ?? '' },
  { header: 'Email', value: (r) => r.group.info.email ?? '' },
  { header: 'Anzahl_Parzellen', value: (r) => r.parcels.length },
  { header: 'Flaeche_total_m2', value: (r) => r.totalArea },
  { header: 'Parzellennummern', value: (r) => r.numbers },
  { header: 'Gemeinden', value: (r) => r.gemeinden },
  { header: 'Zonen', value: (r) => r.zones },
];

/**
 * Triggers a browser file download for an in-memory file (a Blob).
 *
 * There is no direct "save this data" API in the browser, so the trick is to
 * wrap the data in a temporary object URL, create a hidden <a download> link,
 * "click" it programmatically, then release the URL again to free memory.
 *
 * @param blob     The file contents.
 * @param filename The name the downloaded file should have.
 */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url); // important: avoids leaking the temporary URL
}

/**
 * Builds a CSV file from the given rows and starts its download.
 * CSV is plain text where columns are separated by commas and rows by newlines.
 *
 * @param rows The owner rows to export (typically the currently displayed list).
 */
function exportCsv(rows: OwnerRow[]) {
  const header = EXPORT_COLUMNS.map((c) => c.header);
  // Convert every cell to a string (CSV has no concept of number vs. text).
  const body = rows.map((r) => EXPORT_COLUMNS.map((c) => String(c.value(r))));
  const csv = [header, ...body]
    // Wrap each value in quotes and escape any inner quote by doubling it ("").
    // This keeps commas, line breaks and quotes inside a value from breaking
    // the column structure.
    .map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(','))
    .join('\n');
  // The leading '﻿' is a UTF-8 Byte Order Mark: it tells Excel the file is
  // UTF-8, so Swiss/German special characters (ä, ö, ü) display correctly.
  downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), 'eigentuemer.csv');
}

/**
 * Builds a real Excel (.xlsx) workbook from the given rows and downloads it.
 *
 * The `xlsx` library is loaded lazily with a dynamic `await import(...)` so its
 * (fairly large) code is only fetched when the user actually exports to Excel,
 * keeping the initial page load lighter. This is why the function is async.
 *
 * @param rows The owner rows to export.
 */
async function exportXlsx(rows: OwnerRow[]) {
  const XLSX = await import('xlsx');
  // Turn each row into a {header: value} object — the shape json_to_sheet wants.
  const records = rows.map((r) =>
    Object.fromEntries(EXPORT_COLUMNS.map((c) => [c.header, c.value(r)]))
  );
  const sheet = XLSX.utils.json_to_sheet(records, {
    header: EXPORT_COLUMNS.map((c) => c.header), // force this exact column order
  });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Eigentümer'); // one named worksheet
  // Render the workbook to a binary array we can wrap in a Blob and download.
  const buffer = XLSX.write(book, { bookType: 'xlsx', type: 'array' });
  downloadBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'eigentuemer.xlsx'
  );
}

// --- Component ---------------------------------------------------------------

/**
 * Renders the owner list panel.
 *
 * @param groups       Owner groups to display (already grouped + colour-coded).
 * @param entries      All saved parcels, used to attach details to each owner.
 * @param onFocusOwner Callback: highlight every parcel of one owner on the map.
 * @param onFlyTo      Callback: zoom the map to a single parcel.
 */

export function OwnerListPanel({ groups, entries, onFocusOwner, onFlyTo }: OwnerListPanelProps) {
  const [filter, setFilter] = useState(''); // text typed into the filter box
  const [sortKey, setSortKey] = useState<SortKey>('countDesc'); // default: most parcels first

  // Empty state: nothing to show yet, so explain how owners get here instead of
  // rendering an empty list.
  if (groups.length === 0) {
    return (
      <p className="text-sm text-ink-500">
        Noch keine Eigentümer erfasst. Tragen Sie bei einer Parzelle einen
        Eigentümer ein, dann erscheinen hier alle Eigentümer als Liste.
      </p>
    );
  }

  const rows = buildRows(groups, entries);
  // "needle" = the search term, lower-cased once so matching is case-insensitive.
  const needle = filter.trim().toLowerCase();
  const displayed = rows
    // Keep a row if there is no search term, or if its full owner text contains it.
    .filter((r) => !needle || r.group.full.toLowerCase().includes(needle))
    // Then sort by whichever option the user picked.
    .sort(SORTS[sortKey].cmp);

  return (
    <div className="space-y-3">
      {/* Toolbar: free-text filter box + sort dropdown */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Eigentümer filtern…"
          aria-label="Eigentümer filtern"
          className="field bg-white px-2.5 py-1.5 text-sm"
        />
        <select
          value={sortKey}
          // The native <select> gives a plain string; we assert it back to our
          // SortKey union since the options can only ever be those keys.
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          aria-label="Sortierung"
          className="shrink-0 rounded-lg border border-ink-300 bg-white px-2 py-1.5 text-xs text-ink-700 outline-none focus:border-ink-500"
        >
          {/* Build one <option> per defined sort, using its German label. */}
          {(Object.keys(SORTS) as SortKey[]).map((key) => (
            <option key={key} value={key}>
              {SORTS[key].label}
            </option>
          ))}
        </select>
      </div>
      {/* "X of Y owners", with a hint when the list is currently filtered. */}
      <p className="text-[11px] text-ink-400">
        {displayed.length} von {rows.length} Eigentümer{needle ? ' (gefiltert)' : ''}
      </p>

      {/* One card per owner */}
      <ul className="space-y-2">
        {displayed.map(({ group, parcels, totalArea, gemeinden }) => (
          <li key={group.key} className="rounded-lg border border-ink-200 p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-line text-sm font-medium text-ink-900">
                  {group.full}
                </p>
                {/* Summary line: count (singular/plural), total area, places.
                    Area and municipalities are only shown when present. */}
                <p className="mt-0.5 text-xs text-ink-500">
                  {group.count} {group.count === 1 ? 'Parzelle' : 'Parzellen'}
                  {totalArea > 0 && ` · ${formatSwissNumber(totalArea)} m²`}
                  {gemeinden && ` · ${gemeinden}`}
                </p>
                {/* "Show parcels on map": highlights all of this owner's parcels. */}
                <button
                  type="button"
                  onClick={() => onFocusOwner(group.key)}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 transition-colors hover:text-brand-700"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
                    <path d="M9 11a3 3 0 106 0 3 3 0 00-6 0z" />
                    <path d="M17.6 17.6A9 9 0 105 5" />
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                  </svg>
                  Parzellen auf Karte zeigen
                </button>
                {/* One clickable chip per parcel; clicking flies the map to it.
                    The chip shows the parcel number, or the full label if the
                    number is missing. `egrid` (a unique parcel ID) is the React key. */}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {parcels.map((entry) => (
                    <button
                      key={entry.egrid}
                      type="button"
                      onClick={() => onFlyTo(entry)}
                      title="Auf der Karte anzeigen"
                      className="rounded-full border border-ink-200 bg-white px-2 py-0.5 text-[11px] text-ink-700 hover:bg-ink-100"
                    >
                      {entry.number ? `Parz. ${entry.number}` : entry.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Export buttons. Note they export `displayed` (the filtered+sorted
          list the user currently sees), not the full underlying list. */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => exportCsv(displayed)}
          className="rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100"
        >
          ⬇ CSV
        </button>
        <button
          type="button"
          onClick={() => exportXlsx(displayed)}
          className="rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100"
        >
          ⬇ Excel (.xlsx)
        </button>
      </div>
    </div>
  );
}
