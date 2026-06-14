/**
 * OwnerFields — the editable owner-details form for a parcel.
 *
 * It collects the owner's name, address and contact fields, and adds a small
 * type-ahead: as the user types a (first/last) name, it suggests owners already
 * entered elsewhere in the app so the same person can be reused with one click
 * (each shown with the colour used for their parcels on the map).
 *
 * Edits are buffered in local state and pushed up via onChange on blur (when a
 * field loses focus) or when a suggestion is picked, so the parent only stores
 * the owner once the user has finished a field.
 */
'use client'; // form with local state and focus handling -> runs in the browser

import { useState } from 'react';
import type { OwnerInfo } from '@/types/parcel';

interface OwnerFieldsProps {
  value: OwnerInfo;
  /** Previously used owners, for the type-ahead suggestions. */
  knownOwners: { color: string; info: OwnerInfo }[];
  /** Persist the (full) owner details. */
  onChange: (info: OwnerInfo) => void;
}

/**
 * Join first name + last name into one display string, trimming each part and
 * dropping any that are empty (so "  Meier" -> "Meier", not " Meier").
 */
function displayName(info: OwnerInfo): string {
  return [info.vorname, info.name].map((s) => s?.trim()).filter(Boolean).join(' ');
}

// Shared CSS classes for the text inputs, defined once to keep them consistent.
const inputCls =
  'field bg-white px-2.5 py-1.5 text-sm placeholder:text-ink-300';

export function OwnerFields({ value, knownOwners, onChange }: OwnerFieldsProps) {
  const [form, setForm] = useState<OwnerInfo>(value); // local working copy of the owner being edited
  const [open, setOpen] = useState(false); // whether the suggestions dropdown is visible

  // Update one or more fields without losing the others (merge the patch into
  // the existing form object).
  const set = (patch: Partial<OwnerInfo>) => setForm((f) => ({ ...f, ...patch }));

  // Suggestions: owners whose name / vorname / full name starts with what's typed.
  // Normalise the typed name/first-name to lowercase so matching is case-insensitive.
  const nameQ = (form.name ?? '').trim().toLowerCase();
  const vornameQ = (form.vorname ?? '').trim().toLowerCase();
  const fullQ = `${vornameQ} ${nameQ}`.trim();
  const suggestions = (
    // With nothing typed, offer the full known list; otherwise filter it.
    nameQ || vornameQ
      ? knownOwners.filter((o) => {
          const dn = displayName(o.info).toLowerCase();
          const n = (o.info.name ?? '').toLowerCase();
          const v = (o.info.vorname ?? '').toLowerCase();
          // Match if the last name or first name starts with what's typed, or
          // the full "Vorname Name" starts with / contains the combined query.
          return (
            (nameQ && n.startsWith(nameQ)) ||
            (vornameQ && v.startsWith(vornameQ)) ||
            dn.startsWith(fullQ) ||
            dn.includes(fullQ)
          );
        })
      : knownOwners
  ).slice(0, 6); // cap the dropdown at 6 entries to keep it compact

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {/* First-name field. Opens the suggestions on focus and saves to the
            parent (onChange) when it loses focus. */}
        <input
          className={inputCls}
          placeholder="Vorname"
          value={form.vorname ?? ''}
          onChange={(e) => set({ vorname: e.target.value })}
          onFocus={() => setOpen(true)}
          onBlur={() => onChange(form)}
        />
        <div className="relative">
          <input
            className={inputCls}
            placeholder="Name"
            value={form.name ?? ''}
            onChange={(e) => {
              set({ name: e.target.value });
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              // Delay closing so a click on a suggestion still registers before
              // the list is removed from the DOM.
              window.setTimeout(() => setOpen(false), 150);
              onChange(form);
            }}
          />
          {open && suggestions.length > 0 && (
            <ul className="scroll-slim absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-ink-200 bg-white p-1 shadow-float">
              {suggestions.map((o, i) => (
                <li key={`${displayName(o.info)}-${i}`}>
                  <button
                    type="button"
                    // mousedown (not click) so it fires before the input blur.
                    // preventDefault keeps focus from shifting; picking a
                    // suggestion fills in the whole owner and saves it at once.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setForm(o.info);
                      onChange(o.info);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-ink-50"
                  >
                    {/* Colour dot matching how this owner's parcels appear on
                        the map, so the same person is easy to recognise. */}
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                      style={{ backgroundColor: o.color }}
                    />
                    <span className="flex-1 truncate text-ink-800">
                      {displayName(o.info) || '—'}
                    </span>
                    {o.info.ort && (
                      <span className="shrink-0 text-[11px] text-ink-400">{o.info.ort}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <input
        className={inputCls}
        placeholder="Adresse (Strasse, Nr.)"
        value={form.strasse ?? ''}
        onChange={(e) => set({ strasse: e.target.value })}
        onBlur={() => onChange(form)}
      />
      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <input
          className={inputCls}
          placeholder="PLZ"
          value={form.plz ?? ''}
          onChange={(e) => set({ plz: e.target.value })}
          onBlur={() => onChange(form)}
        />
        <input
          className={inputCls}
          placeholder="Ort"
          value={form.ort ?? ''}
          onChange={(e) => set({ ort: e.target.value })}
          onBlur={() => onChange(form)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          className={inputCls}
          placeholder="Telefon"
          value={form.telefon ?? ''}
          onChange={(e) => set({ telefon: e.target.value })}
          onBlur={() => onChange(form)}
        />
        <input
          className={inputCls}
          type="email"
          placeholder="E-Mail"
          value={form.email ?? ''}
          onChange={(e) => set({ email: e.target.value })}
          onBlur={() => onChange(form)}
        />
      </div>
    </div>
  );
}
