'use client';

import { useEffect, useState } from 'react';
import { fetchExactZones, type ExactZone } from '@/lib/oereb';

export type ExactZoneStatus = 'idle' | 'loading' | 'loaded' | 'unavailable' | 'error';

export interface ExactZoneState {
  status: ExactZoneStatus;
  /** Precise cantonal zones (with area-share %), largest first. */
  zones: ExactZone[];
}

/**
 * Fetches the precise cantonal land-use zone(s) from the ÖREB cadastre whenever
 * the parcel changes. Degrades to 'unavailable' for cantons without a service
 * or parcels without a published land-use plan, so the caller can fall back to
 * the harmonized federal category.
 */
export function useExactZone(canton: string | null, egrid: string | null): ExactZoneState {
  const [state, setState] = useState<ExactZoneState>({ status: 'idle', zones: [] });

  useEffect(() => {
    if (!canton || !egrid || !egrid.startsWith('CH')) {
      setState({ status: 'idle', zones: [] });
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setState({ status: 'loading', zones: [] });
    fetchExactZones(canton, egrid, controller.signal)
      .then((zones) => {
        if (cancelled) return;
        if (zones && zones.length > 0) setState({ status: 'loaded', zones });
        else setState({ status: 'unavailable', zones: [] });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', zones: [] });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [canton, egrid]);

  return state;
}
