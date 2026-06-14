/**
 * ParcelPanel
 * -----------
 * The detail sidebar for a SINGLE land parcel — the panel the user sees after
 * clicking a spot on the map or searching for an address / parcel number. It is
 * the counterpart to WatchlistPanel (which shows the whole saved collection).
 *
 * Depending on the load `status` it renders one of several states:
 *  - idle    -> a hint to click the map or search,
 *  - loading -> a spinner,
 *  - error   -> the error message,
 *  - empty   -> "no parcel found here",
 *  - success -> the full parcel details (area, zone, address, EGRID, heritage
 *               status), an editable owner section, a comment thread, and action
 *               buttons (star/save, official ÖREB PDF, cantonal geoportal, and a
 *               Zug-specific monument map link).
 *
 * Like WatchlistPanel, this component is "presentational": it receives all data
 * and every action callback through props and never fetches or stores data
 * itself. Editing the owner or posting a comment automatically saves the parcel
 * to the watchlist — that behaviour lives in the parent, this panel just calls
 * the provided callbacks.
 */
'use client';

import { CommentSection } from '@/components/CommentSection';
import { OwnerFields } from '@/components/OwnerFields';
import { DenkmalschutzBadge } from '@/components/DenkmalschutzBadge';
import { formatSwissNumber } from '@/lib/format';
import { oerebPdfUrl } from '@/lib/oereb';
import type { ParcelLoadStatus } from '@/hooks/useParcelData';
import type {
  DenkmalStatus,
  OwnerInfo,
  ParcelComment,
  ParcelInfo,
  WatchlistEntry,
} from '@/types/parcel';

// Props from the parent page. `status`/`parcel`/`error` describe what to show;
// the `on…` callbacks report user actions back up. Several fields already carry
// their own JSDoc below to explain non-obvious meanings.
interface ParcelPanelProps {
  status: ParcelLoadStatus;
  parcel: ParcelInfo | null;
  zone: string | null;
  /** Precise cantonal zone(s) from the ÖREB cadastre, formatted with %, or null. */
  exactZoneText: string | null;
  exactZoneLoading: boolean;
  error: string | null;
  denkmalStatus: DenkmalStatus;
  starred: boolean;
  /** Structured owner details for this parcel (empty if none). */
  ownerInfo: OwnerInfo;
  comments: ParcelComment[];
  /** Colour of this parcel's owner group, or null if it has no owner. */
  ownerColor: string | null;
  /** Other watchlist parcels that share this parcel's owner. */
  ownerSiblings: WatchlistEntry[];
  /** Distinct owners already used, for the type-ahead suggestions. */
  knownOwners: { color: string; info: OwnerInfo }[];
  onToggleStar: () => void;
  /** Persist the owner details (auto-adds the parcel to the watchlist). */
  onOwnerInfoChange: (info: OwnerInfo) => void;
  /** Show one of the same-owner siblings on the map. */
  onFlyToSibling: (entry: WatchlistEntry) => void;
  /** Post / edit / remove a comment (posting auto-adds to the watchlist). */
  onPostComment: (text: string) => void;
  onEditComment: (id: string, text: string) => void;
  onRemoveComment: (id: string) => void;
}

// --- Small presentational helpers ----------------------------------------

/**
 * A single label/value line in the details card (label on the left, value on
 * the right), e.g. "Fläche … 1'250 m²".
 * @param label The field name shown on the left.
 * @param children The value (any React node) shown on the right.
 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-ink-400">
        {label}
      </span>
      <span className="text-right text-sm font-medium text-ink-900">{children}</span>
    </div>
  );
}

/**
 * Centered placeholder used for the idle / empty / loading / error states.
 * Keeps those four near-identical screens consistent in one place.
 * @param icon The icon/spinner shown in the circle at the top.
 * @param children The message text below the icon.
 * @param tone Colour scheme: 'muted' (grey, default) or 'error' (red).
 */
function PanelState({
  icon,
  children,
  tone = 'muted',
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: 'muted' | 'error';
}) {
  return (
    <div className="flex flex-col items-center px-2 pt-10 text-center">
      <div
        className={`mb-3 flex h-11 w-11 items-center justify-center rounded-full ${
          tone === 'error' ? 'bg-red-50 text-red-500' : 'bg-ink-100 text-ink-400'
        }`}
      >
        {icon}
      </div>
      <p className={`max-w-[16rem] text-sm ${tone === 'error' ? 'text-red-600' : 'text-ink-500'}`}>
        {children}
      </p>
    </div>
  );
}

/**
 * The single-parcel detail panel (see the file header for the overview).
 * Returns early with a PanelState placeholder while idle/loading/error/empty,
 * then renders the full detail view once a parcel has loaded successfully.
 */
export function ParcelPanel({
  status,
  parcel,
  zone,
  exactZoneText,
  exactZoneLoading,
  error,
  denkmalStatus,
  starred,
  ownerInfo,
  comments,
  ownerColor,
  ownerSiblings,
  knownOwners,
  onToggleStar,
  onOwnerInfoChange,
  onFlyToSibling,
  onPostComment,
  onEditComment,
  onRemoveComment,
}: ParcelPanelProps) {
  // --- Non-success states ------------------------------------------------
  // Each branch returns its own placeholder, so the main detail JSX further
  // down only ever runs once a parcel is actually loaded.

  // Nothing selected yet: prompt the user to click the map or search.
  if (status === 'idle') {
    return (
      <PanelState
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5">
            <path d="M4 5l5.5-2 5 2L20 3v16l-5.5 2-5-2L4 21z" />
            <path d="M9.5 3v16M14.5 5v16" />
          </svg>
        }
      >
        Klicken Sie auf die Karte oder suchen Sie eine Adresse bzw. Parzellennummer,
        um Parzellendetails zu sehen.
      </PanelState>
    );
  }
  // Data is being fetched: show a spinner.
  if (status === 'loading') {
    return (
      <PanelState
        icon={
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink-200 border-t-brand-500" />
        }
      >
        Parzelle wird geladen…
      </PanelState>
    );
  }
  // Fetch failed: show the error message in the red ("error") tone.
  if (status === 'error') {
    return (
      <PanelState
        tone="error"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5">
            <path d="M12 9v4M12 17h.01" />
            <path d="M10.3 3.86l-8.06 13.9A2 2 0 004 21h16a2 2 0 001.76-3.24l-8.06-13.9a2 2 0 00-3.4 0z" />
          </svg>
        }
      >
        Fehler beim Laden der Parzelle: {error ?? 'Unbekannter Fehler'}
      </PanelState>
    );
  }
  // Lookup succeeded but found nothing at that location (or, defensively, parcel
  // is missing). The `!parcel` check also reassures TypeScript that `parcel` is
  // non-null in all the code below.
  if (status === 'empty' || !parcel) {
    return (
      <PanelState
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
        }
      >
        An diesem Punkt wurde keine Parzelle gefunden.
      </PanelState>
    );
  }

  // --- Success state: derive a few display strings -----------------------
  // Build the link to the official ÖREB cadastre PDF (may be null if the canton
  // isn't supported).
  const oerebUrl = oerebPdfUrl(parcel.canton, parcel.egrid);
  // Combine postal code + place into "6300 Zug" (skipping whichever is missing).
  const plzPlace = [parcel.plz, parcel.place].filter(Boolean).join(' ');
  // Title: parcel number, with address + municipality as the subtitle.
  const subtitle = [parcel.address, parcel.gemeinde].filter(Boolean).join(', ');

  return (
    <div>
      {/* --- Header: parcel title, subtitle and area badge ----------------- */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold tracking-tight text-ink-900">
            {parcel.label}
          </h2>
          {subtitle && <p className="mt-0.5 truncate text-sm text-ink-500">{subtitle}</p>}
        </div>
        {/* Area badge — only shown when an area is actually known (> 0). */}
        {parcel.areaM2 > 0 && (
          <span className="mt-0.5 shrink-0 rounded-md bg-ink-100 px-2 py-1 text-xs font-semibold tabular-nums text-ink-600">
            {formatSwissNumber(parcel.areaM2)} m²
          </span>
        )}
      </div>

      {/* --- Details card: one Row per attribute --------------------------- */}
      <div className="mt-4 divide-y divide-ink-100 rounded-xl border border-ink-200 bg-white px-3.5 shadow-card">
        <Row label="Fläche">
          {parcel.areaM2 > 0 ? `${formatSwissNumber(parcel.areaM2)} m²` : 'n/a'}
        </Row>
        {/* Zone is shown in two tiers. The precise cantonal zone (exactZoneText)
            comes from a separate, slower ÖREB lookup, so it may load later.
              - If we have it: show it big, with the generic zone below as context.
              - If not: show the generic zone (or a "data unavailable" note), plus
                a "loading…" hint while the precise lookup is still running. */}
        <Row label="Zone">
          {exactZoneText ? (
            <span className="flex flex-col items-end">
              <span>{exactZoneText}</span>
              {zone && (
                <span className="text-xs font-normal text-ink-400">{zone}</span>
              )}
            </span>
          ) : (
            <span className="flex flex-col items-end">
              <span>
                {zone ?? (
                  <span className="font-normal text-ink-400">
                    Daten nicht verfügbar — Geoportal prüfen
                  </span>
                )}
              </span>
              {exactZoneLoading && (
                <span className="text-xs font-normal text-ink-400">
                  genaue Zone wird geladen…
                </span>
              )}
            </span>
          )}
        </Row>
        <Row label="Adresse">
          {parcel.address ?? <span className="font-normal text-ink-300">—</span>}
        </Row>
        <Row label="PLZ / Ort">
          {plzPlace || <span className="font-normal text-ink-300">—</span>}
        </Row>
        <Row label="Gemeinde">
          {parcel.gemeinde ?? <span className="font-normal text-ink-300">—</span>}
        </Row>
        {/* EGRID = the unique, Switzerland-wide identifier for a land parcel;
            shown in a monospace font since it's a code, not prose. */}
        <Row label="EGRID">
          <span className="font-mono text-xs text-ink-600">{parcel.egrid}</span>
        </Row>
        {/* Heritage-protection status, rendered as a coloured badge. */}
        <Row label="Denkmalschutz">
          <DenkmalschutzBadge status={denkmalStatus} />
        </Row>
      </div>

      {/* --- Owner + comments card ---------------------------------------- */}
      <div className="mt-4 space-y-4 rounded-xl border border-ink-200 bg-ink-50 p-3.5">
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-900">
            {/* Coloured swatch matching this owner's group colour on the map. */}
            {ownerColor && (
              <span
                className="h-3 w-3 shrink-0 rounded-[4px] ring-1 ring-inset ring-black/10"
                style={{ backgroundColor: ownerColor }}
              />
            )}
            Eigentümer
          </label>
          {/* Editable owner form. Keyed by egrid so switching parcels resets its
              internal draft state instead of carrying it over. Saving here
              auto-adds the parcel to the watchlist (handled by the parent). */}
          <OwnerFields
            key={`owner-${parcel.egrid}`}
            value={ownerInfo}
            knownOwners={knownOwners}
            onChange={onOwnerInfoChange}
          />
          {/* "Same owner" shortcuts: other saved parcels with this same owner,
              shown as chips that fly the map to that parcel when clicked. */}
          {ownerSiblings.length > 0 && (
            <div className="mt-2.5">
              <p className="text-[11px] font-medium text-ink-400">
                Gleicher Eigentümer ({ownerSiblings.length}):
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {ownerSiblings.map((sibling) => (
                  <button
                    key={sibling.egrid}
                    type="button"
                    onClick={() => onFlyToSibling(sibling)}
                    title="Auf der Karte anzeigen"
                    className="flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-xs font-medium text-ink-700 transition-colors hover:border-ink-300 hover:bg-ink-50"
                  >
                    {ownerColor && (
                      <span
                        className="h-2 w-2 rounded-full ring-1 ring-inset ring-black/10"
                        style={{ backgroundColor: ownerColor }}
                      />
                    )}
                    {sibling.number ? `Parz. ${sibling.number}` : sibling.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink-900">
            Kommentare
          </label>
          <CommentSection
            comments={comments}
            onPost={onPostComment}
            onEdit={onEditComment}
            onRemove={onRemoveComment}
          />
        </div>
        {/* Reminder that editing owner/comments auto-saves to the watchlist. */}
        <p className="flex items-start gap-1.5 text-[11px] text-ink-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 8h.01" />
          </svg>
          Eigentümer und Kommentare werden automatisch in der Watchlist gespeichert.
        </p>
      </div>

      {/* --- Action buttons / external links ------------------------------ */}
      <div className="mt-4 flex flex-wrap gap-2">
        {/* Star toggle: add to / remove from the watchlist. `aria-pressed` and
            the fill of the star icon reflect the current `starred` state. */}
        <button
          type="button"
          onClick={onToggleStar}
          aria-pressed={starred}
          className={`btn px-3 py-2 ${
            starred
              ? 'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
              : 'bg-ink-900 text-white shadow-sm hover:bg-ink-800'
          }`}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill={starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
            <path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.9l-5.8 3.05 1.1-6.46-4.69-4.58 6.49-.94z" />
          </svg>
          {starred ? 'Auf der Watchlist' : 'Zur Watchlist'}
        </button>
        {/* Link to the official ÖREB cadastre PDF (public-law restrictions on the
            property). Only rendered when a URL exists for this canton. Opens in a
            new tab; rel="noopener noreferrer" is a security best-practice for
            external target="_blank" links. */}
        {oerebUrl && (
          <a
            href={oerebUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Offizieller Auszug aus dem ÖREB-Kataster (alle öffentlich-rechtlichen Eigentumsbeschränkungen). Die Erstellung kann einen Moment dauern."
            className="btn-secondary px-3 py-2"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6M9 13h6M9 17h6" />
            </svg>
            ÖREB-Auszug (PDF)
          </a>
        )}
        {/* Link to the canton's own geoportal for this parcel, when available. */}
        {parcel.geoportalUrl && (
          <a
            href={parcel.geoportalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary px-3 py-2"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
              <path d="M7 17L17 7M9 7h8v8" />
            </svg>
            Geoportal
          </a>
        )}
        {/* Zug-only extra: deep-link into ZugMap centred on this parcel, showing
            its protected monuments. The center is taken from the parcel's LV95
            Swiss national grid coordinates (rounded to whole metres), and the
            layers/link parameters preselect the heritage ("Denkmäler") layer. */}
        {parcel.canton === 'ZG' && (
          <a
            href={`https://zugmap.ch/bmcl/?project=ZugMap.ch&scale=2000&center=${Math.round(
              parcel.lv95[0]
            )},${Math.round(
              parcel.lv95[1]
            )}&layers=4f625f9b-c521-45ec-bde0-2897a52ff9d9&link=denkmaeler`}
            target="_blank"
            rel="noopener noreferrer"
            title="Schützenswerte / schutzwürdige Denkmäler dieser Parzelle in ZugMap anzeigen"
            className="btn-secondary px-3 py-2"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
              <path d="M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M12 3L3 8h18z" />
            </svg>
            Denkmäler (ZugMap)
          </a>
        )}
      </div>
    </div>
  );
}
