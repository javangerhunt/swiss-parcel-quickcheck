'use client';

interface OwnerQuickPickProps {
  /** Existing owners; `full` is the complete multi-line text applied on pick. */
  owners: { name: string; color: string; full: string }[];
  onPick: (fullOwnerText: string) => void;
}

/**
 * Compact colour-coded chips of owners already in use. Clicking one copies that
 * owner's ENTIRE field (all lines — name, address, etc.) onto the parcel, so the
 * parcels group (and colour) together — a clearer, more visual alternative to a
 * dropdown.
 */
export function OwnerQuickPick({ owners, onPick }: OwnerQuickPickProps) {
  if (owners.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[11px] text-gray-400">Vorhanden:</span>
      {owners.map((owner) => (
        <button
          key={owner.name}
          type="button"
          onClick={() => onPick(owner.full)}
          title={`Eigentümer „${owner.name}“ vollständig übernehmen`}
          className="flex max-w-[12rem] items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-100"
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: owner.color }}
          />
          <span className="truncate">{owner.name}</span>
        </button>
      ))}
    </div>
  );
}
