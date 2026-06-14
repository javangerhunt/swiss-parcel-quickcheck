/**
 * Compact filter form for an area search.
 *
 * Shown inline inside the search dropdown, under a chosen Gemeinde/Ort
 * (municipality/place). The user can narrow results by zone, parcel area (m²)
 * and building year (Baujahr). On submit it hands the chosen filters up to the
 * parent via the `onSearch` callback — this component itself does not run the
 * search, it only collects the criteria.
 */
'use client'; // runs in the browser: it uses React state and user input

import { useState } from 'react';
import { ZONE_OPTIONS, type AreaFilters } from '@/lib/areaSearch';

/**
 * Turn a text-input value into a number, or null when it is empty/invalid.
 * Inputs always give strings, but the filters expect numbers, so we convert
 * here and treat anything unparseable as "no limit set".
 */
const num = (v: string): number | null => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const inputCls =
  'w-full rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs outline-none focus:border-ink-400';

/**
 * @param onSearch called with the assembled filters when the user submits
 */
export function AreaFilterForm({ onSearch }: { onSearch: (filters: AreaFilters) => void }) {
  // One piece of state per field. Each is kept as a string because that is what
  // the <input>/<select> elements provide; they are converted on submit.
  const [zone, setZone] = useState('');
  const [minM2, setMinM2] = useState('');
  const [maxM2, setMaxM2] = useState('');
  const [minYear, setMinYear] = useState('');
  const [maxYear, setMaxYear] = useState('');

  return (
    <div className="space-y-2 rounded-lg bg-ink-50 p-2.5">
      <select
        value={zone}
        onChange={(e) => setZone(e.target.value)}
        className={inputCls}
        aria-label="Zone"
      >
        <option value="">Alle Zonen</option>
        {/* One dropdown entry per known zone type (Wohnzone, etc.). */}
        {ZONE_OPTIONS.map((z) => (
          <option key={z} value={z}>
            {z}
          </option>
        ))}
      </select>
      <div>
        <span className="mb-0.5 block text-[10px] font-medium text-ink-400">Fläche (m²)</span>
        <div className="flex items-center gap-1.5">
          <input className={inputCls} type="number" inputMode="numeric" placeholder="min" value={minM2} onChange={(e) => setMinM2(e.target.value)} />
          <span className="text-ink-400">–</span>
          <input className={inputCls} type="number" inputMode="numeric" placeholder="max" value={maxM2} onChange={(e) => setMaxM2(e.target.value)} />
        </div>
      </div>
      <div>
        <span className="mb-0.5 block text-[10px] font-medium text-ink-400">Baujahr</span>
        <div className="flex items-center gap-1.5">
          <input className={inputCls} type="number" inputMode="numeric" placeholder="ab" value={minYear} onChange={(e) => setMinYear(e.target.value)} />
          <span className="text-ink-400">–</span>
          <input className={inputCls} type="number" inputMode="numeric" placeholder="bis" value={maxYear} onChange={(e) => setMaxYear(e.target.value)} />
        </div>
      </div>
      <button
        type="button"
        // On click, bundle the fields into an AreaFilters object and pass it up.
        // Empty values become null (zone || null, and num() for the numbers),
        // which the search treats as "no restriction on this criterion".
        onClick={() =>
          onSearch({
            zone: zone || null,
            minM2: num(minM2),
            maxM2: num(maxM2),
            minYear: num(minYear),
            maxYear: num(maxYear),
          })
        }
        className="btn-primary w-full px-3 py-1.5 text-xs"
      >
        Parzellen suchen
      </button>
    </div>
  );
}
