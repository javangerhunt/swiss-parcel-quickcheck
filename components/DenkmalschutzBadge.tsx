import type { DenkmalStatus } from '@/types/parcel';

export function DenkmalschutzBadge({ status }: { status: DenkmalStatus }) {
  if (status === 'idle') return null;
  if (status === 'loading') {
    return <span className="text-sm text-gray-400">Denkmalschutz-Prüfung läuft…</span>;
  }
  if (status === 'error') {
    return (
      <span className="text-sm text-gray-400">
        Denkmalschutz-Prüfung fehlgeschlagen
      </span>
    );
  }
  if (status === 'clear') {
    return <span className="text-sm text-green-600">✓ Kein Denkmalschutz (ISOS/KGS)</span>;
  }

  const label =
    status === 'both'
      ? 'ISOS + KGS geschützt'
      : status === 'isos'
        ? 'ISOS Ortsbild'
        : 'KGS Kulturgut';

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-800"
      title="Die Parzelle liegt in einem national inventarisierten Schutzbereich (ISOS-Ortsbild bzw. KGS-Kulturgut). Kantonale Schutzmassnahmen im Geoportal prüfen."
    >
      ⚠ {label}
    </span>
  );
}
