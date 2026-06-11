'use client';

import { DenkmalschutzBadge } from '@/components/DenkmalschutzBadge';
import { formatSwissNumber } from '@/lib/format';
import { oerebPdfUrl } from '@/lib/oereb';
import type { ParcelLoadStatus } from '@/hooks/useParcelData';
import type { DenkmalStatus, ParcelInfo } from '@/types/parcel';

interface ParcelPanelProps {
  status: ParcelLoadStatus;
  parcel: ParcelInfo | null;
  zone: string | null;
  error: string | null;
  denkmalStatus: DenkmalStatus;
  starred: boolean;
  onToggleStar: () => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="shrink-0 text-sm text-gray-500">{label}</span>
      <span className="text-right text-sm font-medium text-gray-900">{children}</span>
    </div>
  );
}

export function ParcelPanel({
  status,
  parcel,
  zone,
  error,
  denkmalStatus,
  starred,
  onToggleStar,
}: ParcelPanelProps) {
  if (status === 'idle') {
    return (
      <p className="text-sm text-gray-500">
        Klicken Sie auf die Karte oder suchen Sie eine Adresse bzw. Parzellennummer,
        um Parzellendetails zu sehen.
      </p>
    );
  }
  if (status === 'loading') {
    return <p className="text-sm text-gray-500">Parzelle wird geladen…</p>;
  }
  if (status === 'error') {
    return (
      <p className="text-sm text-red-600">
        Fehler beim Laden der Parzelle: {error ?? 'Unbekannter Fehler'}
      </p>
    );
  }
  if (status === 'empty' || !parcel) {
    return (
      <p className="text-sm text-gray-500">
        An diesem Punkt wurde keine Parzelle gefunden.
      </p>
    );
  }

  const oerebUrl = oerebPdfUrl(parcel.canton, parcel.egrid);

  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900">{parcel.label}</h2>
      <div className="mt-3 divide-y divide-gray-100">
        <Row label="Fläche">
          {parcel.areaM2 > 0 ? `${formatSwissNumber(parcel.areaM2)} m²` : 'n/a'}
        </Row>
        <Row label="Zone">
          {zone ?? (
            <span className="font-normal text-gray-400">
              Daten nicht verfügbar — Geoportal prüfen
            </span>
          )}
        </Row>
        <Row label="EGRID">
          <span className="font-mono text-xs">{parcel.egrid}</span>
        </Row>
        <Row label="Denkmalschutz">
          <DenkmalschutzBadge status={denkmalStatus} />
        </Row>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onToggleStar}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            starred
              ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
              : 'bg-gray-900 text-white hover:bg-gray-700'
          }`}
        >
          {starred ? '★ Auf der Watchlist' : '☆ Zur Watchlist'}
        </button>
        {oerebUrl && (
          <a
            href={oerebUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Offizieller Auszug aus dem ÖREB-Kataster (alle öffentlich-rechtlichen Eigentumsbeschränkungen). Die Erstellung kann einen Moment dauern."
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            📄 ÖREB-Auszug (PDF)
          </a>
        )}
        {parcel.geoportalUrl && (
          <a
            href={parcel.geoportalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            ↗ Geoportal
          </a>
        )}
      </div>
    </div>
  );
}
