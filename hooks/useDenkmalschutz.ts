'use client';

import { useEffect, useState } from 'react';
import { checkDenkmalschutz } from '@/lib/geoAdmin';
import type { DenkmalStatus } from '@/types/parcel';

/**
 * Runs the ISOS/KGS check in the background whenever the LV95 point changes.
 * Returns 'idle' when no parcel is selected and 'loading' while the two
 * identify calls are in flight.
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
