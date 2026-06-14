'use client';

import { useEffect, useState } from 'react';
import { checkDenkmalschutz } from '@/lib/geoAdmin';
import type { DenkmalStatus } from '@/types/parcel';

/**
 * Heritage-protection ("Denkmalschutz") status for a parcel. The actual check
 * runs in the backend; this hook just triggers it and tracks loading state.
 *
 * Two federal inventories are consulted, both keyed on the LV95 point:
 *   - ISOS: the inventory of Swiss townscapes/sites worthy of protection
 *     (Inventar der schützenswerten Ortsbilder der Schweiz);
 *   - KGS: the inventory of cultural property (Kulturgüterschutz), i.e. listed
 *     buildings and monuments.
 *
 * Runs the check in the background whenever the LV95 point changes. The result
 * is a DenkmalStatus: 'idle' when no parcel is selected, 'loading' while the
 * backend call is in flight, 'error' on failure, and otherwise the backend's
 * verdict ('clear', 'isos', 'kgs' or 'both' depending on which inventories the
 * point falls inside).
 */
export function useDenkmalschutz(lv95: [number, number] | null): DenkmalStatus {
  const [status, setStatus] = useState<DenkmalStatus>('idle');
  const easting = lv95?.[0];
  const northing = lv95?.[1];

  useEffect(() => {
    if (easting === undefined || northing === undefined) {
      setStatus('idle');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    checkDenkmalschutz(easting, northing)
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [easting, northing]);

  return status;
}
