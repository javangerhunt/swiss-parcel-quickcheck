/**
 * Owner helpers for the watchlist: turning owner details into text and grouping
 * watchlist parcels by who owns them.
 *
 * A user can record an owner for each saved parcel, either as free text or as
 * structured fields (name, address, phone, email). An owner may be a person, a
 * company, or a public body such as a Gemeinde (the Swiss term for a
 * municipality / local commune). This file does three things:
 *   - convert structured owner details to and from a single multi-line string;
 *   - derive a stable "grouping key" so parcels with the same owner cluster
 *     together even if the text was typed with different spacing/casing;
 *   - assign each distinct owner a colour, so parcels owned by the same party
 *     can be drawn in the same colour on the map and in the watchlist.
 */
import type { OwnerInfo, WatchlistEntry } from '@/types/parcel';

/** Serializes structured owner details to the canonical multi-line string
 *  (line 1 = "Vorname Name" — the grouping key). Empty parts are dropped. */
export function ownerInfoToString(info: OwnerInfo): string {
  const name = [info.vorname, info.name].map((s) => s?.trim()).filter(Boolean).join(' ');
  const plzOrt = [info.plz, info.ort].map((s) => s?.trim()).filter(Boolean).join(' ');
  return [name, info.strasse, plzOrt, info.telefon, info.email]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join('\n');
}

/** Number of filled fields — used to pick the most complete representative. */
function filledCount(info: OwnerInfo | undefined): number {
  return info ? Object.values(info).filter((v) => v && String(v).trim()).length : 0;
}

/** Best-effort OwnerInfo for an entry (structured, or derived from legacy text). */
export function entryOwnerInfo(entry: WatchlistEntry): OwnerInfo {
  if (entry.ownerInfo) return entry.ownerInfo;
  return { name: ownerDisplayName(entry.owner) ?? '' };
}

/**
 * Distinct, well-separated colours for owner groups. Red is intentionally
 * excluded — it is reserved for the currently selected parcel outline.
 */
export const OWNER_COLORS = [
  '#2563eb', // blue
  '#16a34a', // green
  '#d97706', // amber
  '#7c3aed', // violet
  '#0d9488', // teal
  '#db2777', // pink
  '#65a30d', // lime
  '#4f46e5', // indigo
  '#ea580c', // orange
  '#0891b2', // cyan
  '#c026d3', // fuchsia
  '#059669', // emerald
];

/** Colour for parcels without an owner. */
export const NO_OWNER_COLOR = '#9ca3af'; // gray-400

/** First non-empty line of the owner field — the name used for display. */
export function ownerDisplayName(owner?: string): string | null {
  if (!owner) return null;
  const line = owner.split('\n').map((s) => s.trim()).find(Boolean);
  return line || null;
}

/**
 * Normalized grouping key for an owner: the first line, lower-cased with
 * collapsed whitespace, so "Gemeinde  Zug" and "gemeinde zug" group together.
 */
export function ownerKey(owner?: string): string | null {
  const name = ownerDisplayName(owner);
  return name ? name.toLowerCase().replace(/\s+/g, ' ') : null;
}

/** One owner cluster: all watchlist parcels sharing the same grouping key. */
export interface OwnerGroup {
  key: string;
  /** First line of the owner field — the display name. */
  name: string;
  /** The full multi-line owner text (representative), for copy / export. */
  full: string;
  /** Representative structured details, for prefilling the owner form. */
  info: OwnerInfo;
  color: string;
  count: number;
}

/**
 * Builds the owner → colour map across all entries. Colours are assigned by
 * sorted owner key so they stay stable as parcels are added or removed.
 */
export function buildOwnerGroups(entries: WatchlistEntry[]): Map<string, OwnerGroup> {
  const names = new Map<string, string>();
  const fulls = new Map<string, string>();
  const infos = new Map<string, OwnerInfo>();
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = ownerKey(entry.owner);
    if (!key) continue;
    if (!names.has(key)) names.set(key, ownerDisplayName(entry.owner) ?? key);
    // Keep the most complete owner text (most lines / longest) as representative.
    const full = entry.owner?.trim() ?? '';
    if (full.length > (fulls.get(key)?.length ?? 0)) fulls.set(key, full);
    // …and the most complete structured details.
    const info = entryOwnerInfo(entry);
    if (filledCount(info) > filledCount(infos.get(key))) infos.set(key, info);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sortedKeys = Array.from(names.keys()).sort((a, b) => a.localeCompare(b, 'de'));
  const groups = new Map<string, OwnerGroup>();
  sortedKeys.forEach((key, index) => {
    groups.set(key, {
      key,
      name: names.get(key)!,
      full: fulls.get(key) || names.get(key)!,
      info: infos.get(key) ?? { name: names.get(key)! },
      color: OWNER_COLORS[index % OWNER_COLORS.length],
      count: counts.get(key)!,
    });
  });
  return groups;
}

/** Colour for an entry's owner (neutral grey when it has no owner). */
export function colorForEntry(
  entry: WatchlistEntry,
  groups: Map<string, OwnerGroup>
): string {
  const key = ownerKey(entry.owner);
  return (key && groups.get(key)?.color) || NO_OWNER_COLOR;
}
