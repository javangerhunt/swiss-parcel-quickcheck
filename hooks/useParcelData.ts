'use client';

import { useCallback, useRef, useState } from 'react';
import { fetchParcel } from '@/lib/geoAdmin';
import type { ParcelInfo } from '@/types/parcel';

export type ParcelLoadStatus = 'idle' | 'loading' | 'loaded' | 'empty' | 'error';

/**
 * Loads parcel + zone data for a WGS84 point. The backend resolves the parcel,
 * its harmonized zone and the location fields in one call; a missing parcel
 * comes back as null and degrades to the 'empty' state.
 */
export function useParcelData() {
  const [status, setStatus] = useState<ParcelLoadStatus>('idle');
  const [parcel, setParcel] = useState<ParcelInfo | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const loadParcel = useCallback(async (lat: number, lon: number) => {
    const id = ++requestId.current;
    setStatus('loading');
    setError(null);
    try {
      const data = await fetchParcel(lat, lon);
      if (id !== requestId.current) return; // a newer request superseded this one

      if (!data) {
        setParcel(null);
        setZone(null);
        setStatus('empty');
        return;
      }

      // ParcelData is a superset of ParcelInfo (plus `zone`), so its fields map
      // straight onto the panel state — lat, lon, lv95, oerebPdfUrl and
      // geometryWgs84 all come from the backend response.
      setZone(data.zone);
      setParcel({
        egrid: data.egrid,
        number: data.number,
        canton: data.canton,
        label: data.label,
        areaM2: data.areaM2,
        geoportalUrl: data.geoportalUrl,
        oerebPdfUrl: data.oerebPdfUrl,
        geometryWgs84: data.geometryWgs84,
        address: data.address,
        plz: data.plz,
        place: data.place,
        gemeinde: data.gemeinde,
        lat: data.lat,
        lon: data.lon,
        lv95: data.lv95,
      });
      setStatus('loaded');
    } catch (err) {
      if (id !== requestId.current) return;
      setParcel(null);
      setZone(null);
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
      setStatus('error');
    }
  }, []);

  return { status, parcel, zone, error, loadParcel };
}
