/**
 * WatchlistPanel
 * --------------
 * The right-hand sidebar panel that lists every parcel the user has "starred"
 * (saved) for later. It is the second main view of the Swiss Parcel Quick-Check
 * app: while ParcelPanel shows ONE parcel the user just clicked on the map, this
 * panel shows the whole collection of saved parcels at once.
 *
 * What the user can do here:
 *  - Sort the saved parcels (by date added, parcel number, area, zone, name).
 *  - Filter them by municipality (Gemeinde), postal code (PLZ) or owner.
 *  - Expand each entry to see/edit owner details and comments, or jump to it on
 *    the map ("Auf Karte zeigen").
 *  - Remove an entry, or export the (filtered) list as a CSV or Excel file so the
 *    research results can be opened in a spreadsheet.
 *
 * The component itself holds no parcel data of its own: the saved parcels and all
 * the action callbacks (add, remove, comment, etc.) are passed in as props from
 * the parent page, which owns the actual application state.
 */
'use client';

import { useState } from 'react';
import { CommentSection } from '@/components/CommentSection';
import { OwnerFields } from '@/components/OwnerFields';
import { formatSwissNumber } from '@/lib/format';
import { entryOwnerInfo, ownerKey, type OwnerGroup } from '@/lib/owners';
import type { OwnerInfo, WatchlistEntry } from '@/types/parcel';

// --- Formatting & sorting helpers ----------------------------------------

// Reusable Swiss-German date+time formatter (e.g. "14.06.26 09:30"). Created
// once at module scope rather than per render, because building an
// Intl.DateTimeFormat is comparatively expensive.
const dateTimeFormat = new Intl.DateTimeFormat('de-CH', {
  dateStyle: 'short',
  timeStyle: 'short',
});

// The set of allowed sort options. Using a string-literal union (instead of a
// plain string) lets TypeScript catch typos and guarantees every key below
// matches an entry in SORT_OPTIONS.
type SortKey =
  | 'newest'
  | 'numberAsc'
  | 'numberDesc'
  | 'areaDesc'
  | 'areaAsc'
  | 'zone'
  | 'label';

// Natural numeric ordering so "2" < "10" and suffixes like "12a" still sort.
const compareNumber = (a: WatchlistEntry, b: WatchlistEntry) =>
  (a.number ?? '').localeCompare(b.number ?? '', 'de', { numeric: true });

// Maps each sort key to its human-readable label (shown in the dropdown) and a
// `compare` function that JavaScript's Array.sort uses: it returns a negative
// number if `a` should come first, positive if `b` should, and 0 if equal.
const SORT_OPTIONS: Record<SortKey, { label: string; compare: (a: WatchlistEntry, b: WatchlistEntry) => number }> = {
  newest: {
    label: 'Neueste zuerst',
    // addedAt is an ISO timestamp string, so comparing strings sorts by time.
    // b vs a (reversed) puts the most recently added entry first.
    compare: (a, b) => b.addedAt.localeCompare(a.addedAt),
  },
  numberAsc: {
    label: 'Parzellennr. (aufsteigend)',
    compare: compareNumber,
  },
  numberDesc: {
    label: 'Parzellennr. (absteigend)',
    compare: (a, b) => compareNumber(b, a),
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

// Sentinel value for the "no filter / show everything" choice in the dropdowns.
// An unlikely-to-collide string is used so it can never clash with a real
// Gemeinde, PLZ or owner value.
const ALL = '__all__';

// Props passed in from the parent page. Most are callbacks: this panel only
// renders and reports user intent (remove this, comment on that, jump there) —
// the parent owns the data and decides what actually happens.
interface WatchlistPanelProps {
  entries: WatchlistEntry[];
  ownerGroups: Map<string, OwnerGroup>;
  ownerLegend: OwnerGroup[];
  knownOwners: { color: string; info: OwnerInfo }[];
  onFlyTo: (entry: WatchlistEntry) => void;
  onFocusOwner: (ownerKey: string) => void;
  onRemove: (egrid: string) => void;
  onUpdateOwnerInfo: (egrid: string, info: OwnerInfo) => void;
  onPostComment: (egrid: string, text: string) => void;
  onEditComment: (egrid: string, commentId: string, text: string) => void;
  onRemoveComment: (egrid: string, commentId: string) => void;
  onOpenCompare: () => void;
}

// --- Export (CSV / Excel) ------------------------------------------------

/**
 * Flattens a parcel's list of comments into a single multi-line string so it
 * fits in one spreadsheet cell, one comment per line as "DD.MM.YY HH:MM text".
 * @param entry The saved parcel whose comments should be formatted.
 * @returns A newline-separated string ("" if the parcel has no comments).
 */
function formatComments(entry: WatchlistEntry): string {
  return (entry.comments ?? [])
    .map((c) => `${dateTimeFormat.format(new Date(c.createdAt))} ${c.text}`)
    .join('\n');
}

// One source of truth for the export columns, shared by CSV and Excel. Each
// column has a `header` (the column title in the file) and a `value` function
// that pulls the matching field out of a parcel. Defining the columns once here
// guarantees the CSV and the Excel export always have identical columns. The
// `?? ''` fallbacks turn missing optional fields into empty cells instead of the
// word "undefined".
const EXPORT_COLUMNS: { header: string; value: (e: WatchlistEntry) => string | number }[] = [
  { header: 'EGRID', value: (e) => e.egrid },
  { header: 'Parzellennummer', value: (e) => e.number ?? '' },
  { header: 'Adresse', value: (e) => e.address ?? '' },
  { header: 'PLZ', value: (e) => e.plz ?? '' },
  { header: 'Ort', value: (e) => e.place ?? '' },
  { header: 'Gemeinde', value: (e) => e.gemeinde ?? '' },
  { header: 'Bezeichnung', value: (e) => e.label },
  { header: 'Flaeche_m2', value: (e) => e.areaM2 },
  { header: 'Zone', value: (e) => e.zone },
  { header: 'Zone_genau', value: (e) => e.exactZone ?? '' },
  { header: 'Eigentuemer', value: (e) => e.owner ?? '' },
  { header: 'Eig_Vorname', value: (e) => entryOwnerInfo(e).vorname ?? '' },
  { header: 'Eig_Name', value: (e) => entryOwnerInfo(e).name ?? '' },
  { header: 'Eig_Strasse', value: (e) => entryOwnerInfo(e).strasse ?? '' },
  { header: 'Eig_PLZ', value: (e) => entryOwnerInfo(e).plz ?? '' },
  { header: 'Eig_Ort', value: (e) => entryOwnerInfo(e).ort ?? '' },
  { header: 'Eig_Telefon', value: (e) => entryOwnerInfo(e).telefon ?? '' },
  { header: 'Eig_Email', value: (e) => entryOwnerInfo(e).email ?? '' },
  { header: 'Denkmalschutz', value: (e) => (e.denkmalschutz ? 'ja' : 'nein') },
  { header: 'Lat', value: (e) => e.lat },
  { header: 'Lon', value: (e) => e.lon },
  { header: 'Hinzugefuegt', value: (e) => e.addedAt },
  { header: 'Kommentare', value: (e) => formatComments(e) },
];

/**
 * Triggers a browser file download for an in-memory Blob (the generated file).
 * The trick is to wrap the data in a temporary object URL, attach it to a hidden
 * <a download> link, "click" it programmatically, then immediately release the
 * URL so the browser can free the memory.
 * @param blob The file contents to download.
 * @param filename The name suggested to the user's browser.
 */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Builds a CSV file from the given parcels and starts a download.
 * @param entries The (already filtered/sorted) parcels to export.
 */
function exportCsv(entries: WatchlistEntry[]) {
  const header = EXPORT_COLUMNS.map((c) => c.header);
  // Turn every parcel into a row of plain strings, one cell per export column.
  const rows = entries.map((e) => EXPORT_COLUMNS.map((c) => String(c.value(e))));
  const csv = [header, ...rows]
    // Wrap every cell in double quotes and escape any quotes inside the text by
    // doubling them ("" ), so commas, line breaks and quotes in the data don't
    // break the CSV structure.
    .map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(','))
    .join('\n');
  // BOM so Excel opens the file with correct umlauts
  downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), 'parcel-watchlist.csv');
}

/**
 * Builds a real Excel (.xlsx) workbook from the given parcels and downloads it.
 * Marked `async` because the SheetJS library is imported lazily.
 * @param entries The (already filtered/sorted) parcels to export.
 */
async function exportXlsx(entries: WatchlistEntry[]) {
  // Loaded on demand so the (large) SheetJS bundle stays out of the initial load.
  const XLSX = await import('xlsx');
  // Convert each parcel into a plain { header: value } object keyed by column
  // header — the shape SheetJS expects for one spreadsheet row.
  const records = entries.map((e) =>
    Object.fromEntries(EXPORT_COLUMNS.map((c) => [c.header, c.value(e)]))
  );
  const sheet = XLSX.utils.json_to_sheet(records, {
    header: EXPORT_COLUMNS.map((c) => c.header),
  });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Watchlist');
  const buffer = XLSX.write(book, { bookType: 'xlsx', type: 'array' });
  downloadBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'parcel-watchlist.xlsx'
  );
}

// --- Filter helpers ------------------------------------------------------

/**
 * Collects the distinct, non-empty values of one text field across all parcels,
 * sorted alphabetically (German collation). Used to fill the Gemeinde and PLZ
 * filter dropdowns with exactly the values that actually occur in the list.
 * @param entries The parcels to scan.
 * @param pick A function that returns the field of interest for one parcel.
 * @returns A sorted array of unique, trimmed values (blanks removed).
 */
function uniqueValues(entries: WatchlistEntry[], pick: (e: WatchlistEntry) => string | undefined) {
  // A Set automatically discards duplicates as we add values.
  const set = new Set<string>();
  for (const e of entries) {
    const value = pick(e)?.trim();
    if (value) set.add(value);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'de'));
}

/**
 * The watchlist sidebar component (see the file header for the full picture).
 * Renders the sort/filter controls, the list of saved parcels and the export
 * buttons. All persistent data arrives via props; the only local state is the
 * current sort/filter selection and which entries are expanded.
 */
export function WatchlistPanel({
  entries,
  ownerGroups,
  ownerLegend,
  knownOwners,
  onFlyTo,
  onFocusOwner,
  onRemove,
  onUpdateOwnerInfo,
  onPostComment,
  onEditComment,
  onRemoveComment,
  onOpenCompare,
}: WatchlistPanelProps) {
  // --- Local UI state ----------------------------------------------------
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [gemeindeFilter, setGemeindeFilter] = useState<string>(ALL);
  const [plzFilter, setPlzFilter] = useState<string>(ALL);
  const [ownerFilter, setOwnerFilter] = useState<string>(ALL);
  // Tracks which entries are currently expanded, keyed by their unique EGRID id.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Open a collapsed entry or collapse an open one. A fresh Set is built each
  // time (rather than mutating the old one) so React detects the state change
  // and re-renders.
  const toggleExpanded = (egrid: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(egrid)) next.delete(egrid);
      else next.add(egrid);
      return next;
    });

  // Empty state: nothing saved yet, so show a friendly hint instead of an empty
  // list (and skip all the filtering/sorting work below).
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center px-2 pt-10 text-center">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-ink-100 text-ink-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5">
            <path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.9l-5.8 3.05 1.1-6.46-4.69-4.58 6.49-.94z" />
          </svg>
        </div>
        <p className="max-w-[17rem] text-sm text-ink-500">
          Noch keine Parzellen gespeichert. Markieren Sie eine Parzelle mit dem Stern,
          um sie hier abzulegen.
        </p>
      </div>
    );
  }

  // --- Derived data (recomputed each render) -----------------------------
  // Build the dropdown option lists from the values present in the saved parcels.
  const gemeinden = uniqueValues(entries, (e) => e.gemeinde);
  const plzList = uniqueValues(entries, (e) => e.plz);

  // Keep only the parcels that match every active filter. A filter set to ALL
  // matches everything, so it effectively switches that filter off.
  const filtered = entries.filter(
    (e) =>
      (gemeindeFilter === ALL || (e.gemeinde ?? '') === gemeindeFilter) &&
      (plzFilter === ALL || (e.plz ?? '') === plzFilter) &&
      (ownerFilter === ALL || (ownerKey(e.owner) ?? '') === ownerFilter)
  );
  // Sort a COPY ([...filtered]) so Array.sort's in-place mutation never touches
  // the original arrays/props. The chosen SortKey picks the compare function.
  const sorted = [...filtered].sort(SORT_OPTIONS[sortKey].compare);
  // True if at least one filter is active — used to show "(gefiltert)" and a
  // count badge on the export buttons.
  const isFiltered = gemeindeFilter !== ALL || plzFilter !== ALL || ownerFilter !== ALL;

  return (
    <div className="space-y-3">
      {/* --- Toolbar: sort dropdown + "compare" button --------------------- */}
      <div className="flex items-center justify-between gap-2">
        {/* Sort selector: its options are generated from SORT_OPTIONS so the
            dropdown and the sorting logic can never drift apart. */}
        <select
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as SortKey)}
          aria-label="Sortierung"
          className="field px-2.5 py-1.5 text-xs"
        >
          {(Object.keys(SORT_OPTIONS) as SortKey[]).map((key) => (
            <option key={key} value={key}>
              {SORT_OPTIONS[key].label}
            </option>
          ))}
        </select>
        {/* Opens the side-by-side comparison view. Disabled until there are at
            least two parcels, since you can't compare a single one. */}
        <button
          type="button"
          onClick={onOpenCompare}
          disabled={entries.length < 2}
          className="btn-secondary shrink-0 px-3 py-1.5 text-xs"
          title={
            entries.length < 2
              ? 'Mindestens zwei Parzellen für einen Vergleich speichern'
              : 'Alle gespeicherten Parzellen nebeneinander vergleichen'
          }
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M12 3v18" />
          </svg>
          Vergleichen
        </button>
      </div>

      {/* Filter by municipality and postal code for the export. */}
      <div className="space-y-2.5 rounded-xl border border-ink-200 bg-ink-50 p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3.5 w-3.5">
            <path d="M3 5h18l-7 8v6l-4-2v-4z" />
          </svg>
          Filter (für Export)
        </p>
        <div className="flex gap-2">
          <label className="flex-1">
            <span className="mb-1 block text-[11px] font-medium text-ink-400">Gemeinde</span>
            <select
              value={gemeindeFilter}
              onChange={(event) => setGemeindeFilter(event.target.value)}
              className="field px-2.5 py-1.5 text-xs"
            >
              <option value={ALL}>Alle Gemeinden</option>
              {gemeinden.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1">
            <span className="mb-1 block text-[11px] font-medium text-ink-400">PLZ</span>
            <select
              value={plzFilter}
              onChange={(event) => setPlzFilter(event.target.value)}
              className="field px-2.5 py-1.5 text-xs"
            >
              <option value={ALL}>Alle PLZ</option>
              {plzList.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
        {/* The owner filter only appears once at least one parcel has an owner
            recorded (ownerLegend lists the distinct owners with their counts). */}
        {ownerLegend.length > 0 && (
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-ink-400">Eigentümer</span>
            <select
              value={ownerFilter}
              onChange={(event) => setOwnerFilter(event.target.value)}
              className="field px-2.5 py-1.5 text-xs"
            >
              <option value={ALL}>Alle Eigentümer</option>
              {ownerLegend.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.name} ({g.count})
                </option>
              ))}
            </select>
          </label>
        )}
        {/* "X von Y Parzellen" — how many match the filter out of the total. */}
        <p className="text-[11px] font-medium text-ink-400">
          <span className="tabular-nums text-ink-600">{sorted.length}</span> von{' '}
          <span className="tabular-nums">{entries.length}</span> Parzellen
          {isFiltered ? ' (gefiltert)' : ''}
        </p>
      </div>

      {/* --- The list of saved parcels ----------------------------------- */}
      <ul className="space-y-2">
        {sorted.map((entry) => {
          const isOpen = expanded.has(entry.egrid);
          // One-line summary shown in the collapsed row, e.g. "Zug · 1'250 m²".
          // filter(Boolean) drops missing fields; join puts " · " between the rest.
          const compactMeta = [
            entry.gemeinde,
            entry.areaM2 > 0 ? `${formatSwissNumber(entry.areaM2)} m²` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <li
              key={entry.egrid}
              className={`overflow-hidden rounded-xl border bg-white shadow-card transition-colors ${
                isOpen ? 'border-ink-300' : 'border-ink-200 hover:border-ink-300'
              }`}
            >
              {/* Compact row: parcel number, Gemeinde · m². */}
              <div className="flex items-center gap-2.5 p-2.5">
                <button
                  type="button"
                  onClick={() => toggleExpanded(entry.egrid)}
                  className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
                  aria-expanded={isOpen}
                  title={isOpen ? 'Zuklappen' : 'Details anzeigen'}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className={`h-3.5 w-3.5 shrink-0 self-center text-ink-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                  {/* Prefer the parcel number ("Parz. 123"); fall back to its
                      label when no number is known. */}
                  <span className="shrink-0 text-sm font-semibold text-ink-900">
                    {entry.number ? `Parz. ${entry.number}` : entry.label}
                  </span>
                  <span className="truncate text-xs text-ink-500">{compactMeta}</span>
                  {/* Warning triangle flags parcels under heritage protection. */}
                  {entry.denkmalschutz && (
                    <span className="shrink-0 text-amber-600" title="Denkmalschutz" aria-label="Denkmalschutz">
                      ⚠
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(entry.egrid)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600"
                  aria-label="Von der Watchlist entfernen"
                  title="Von der Watchlist entfernen"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="h-3.5 w-3.5">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>

              {/* Expanded details: only rendered for entries the user opened. */}
              {isOpen && (
                <div className="space-y-2.5 border-t border-ink-100 bg-ink-50/60 p-3">
                  {/* Zone line: show the precise cantonal zone if known,
                      otherwise the generic one; if both exist, show the generic
                      one in grey as extra context. */}
                  <p className="text-xs font-medium text-ink-600">
                    {entry.exactZone || entry.zone}
                    {entry.exactZone && entry.zone && (
                      <span className="font-normal text-ink-400"> · {entry.zone}</span>
                    )}
                    {entry.denkmalschutz && (
                      <span className="ml-1 text-amber-600">· ⚠ Denkmalschutz</span>
                    )}
                  </p>
                  {(entry.gemeinde || entry.plz || entry.address) && (
                    <p className="text-xs text-ink-400">
                      {[
                        entry.address,
                        [entry.plz, entry.place].filter(Boolean).join(' '),
                        entry.gemeinde,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                  {/* Editable owner details. The `key` forces React to mount a
                      fresh OwnerFields per parcel, so its internal draft state
                      doesn't leak between different entries. */}
                  <OwnerFields
                    key={`owner-${entry.egrid}`}
                    value={entryOwnerInfo(entry)}
                    knownOwners={knownOwners}
                    onChange={(info) => onUpdateOwnerInfo(entry.egrid, info)}
                  />
                  {/* Comment thread for this parcel. Each callback is bound to
                      this entry's egrid before bubbling up to the parent. */}
                  <CommentSection
                    comments={entry.comments ?? []}
                    onPost={(text) => onPostComment(entry.egrid, text)}
                    onEdit={(id, text) => onEditComment(entry.egrid, id, text)}
                    onRemove={(id) => onRemoveComment(entry.egrid, id)}
                  />
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
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* --- Export buttons ----------------------------------------------
          Both export exactly what's currently shown (`sorted`, i.e. after
          filtering), and are disabled when that produces no rows. */}
      <div className="flex flex-wrap gap-2 border-t border-ink-100 pt-3">
        <button
          type="button"
          onClick={() => exportCsv(sorted)}
          disabled={sorted.length === 0}
          className="btn-secondary px-3 py-2"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
            <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
          </svg>
          CSV{isFiltered ? ` (${sorted.length})` : ''}
        </button>
        <button
          type="button"
          onClick={() => exportXlsx(sorted)}
          disabled={sorted.length === 0}
          className="btn-secondary px-3 py-2"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
            <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
          </svg>
          Excel (.xlsx){isFiltered ? ` (${sorted.length})` : ''}
        </button>
      </div>
    </div>
  );
}
