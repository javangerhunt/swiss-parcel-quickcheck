/**
 * A small coloured "badge" that summarises a parcel's heritage-protection
 * status (Denkmalschutz).
 *
 * The app checks two national Swiss inventories — ISOS (protected townscapes)
 * and KGS (cultural-property objects) — and this component turns the resulting
 * status into a single, glanceable label:
 *   - idle    -> nothing shown (no check requested yet)
 *   - loading -> spinner ("Prüfung läuft…")
 *   - error   -> a neutral "check failed" note
 *   - clear   -> green badge: no protection found
 *   - isos / kgs / both -> amber warning badge naming what applies
 */
import type { DenkmalStatus } from '@/types/parcel';

/**
 * @param status the current check result (see the union type above)
 * @returns the badge element, or null when there is nothing to show
 */
export function DenkmalschutzBadge({ status }: { status: DenkmalStatus }) {
  if (status === 'idle') return null; // nothing to display before a check runs
  if (status === 'loading') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-ink-400">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-ink-200 border-t-ink-400" />
        Prüfung läuft…
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="text-sm text-ink-400">
        Prüfung fehlgeschlagen
      </span>
    );
  }
  if (status === 'clear') {
    // Green badge with a check mark: the parcel is in neither inventory.
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3 w-3">
          <path d="M20 6L9 17l-5-5" />
        </svg>
        Kein Schutz (ISOS/KGS)
      </span>
    );
  }

  // Remaining cases ('both' | 'isos' | 'kgs') all mean some protection applies.
  // Pick the wording for whichever inventory(ies) matched.
  const label =
    status === 'both'
      ? 'ISOS + KGS geschützt'
      : status === 'isos'
        ? 'ISOS Ortsbild'
        : 'KGS Kulturgut';

  // Amber warning badge with a triangle icon. The `title` shows extra guidance
  // on hover and reminds the user to also check cantonal protection rules.
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200"
      title="Die Parzelle liegt in einem national inventarisierten Schutzbereich (ISOS-Ortsbild bzw. KGS-Kulturgut). Kantonale Schutzmassnahmen im Geoportal prüfen."
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-3 w-3">
        <path d="M10.3 3.86l-8.06 13.9A2 2 0 004 21h16a2 2 0 001.76-3.24l-8.06-13.9a2 2 0 00-3.4 0z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
      {label}
    </span>
  );
}
