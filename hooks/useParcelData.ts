'use client';

import { useCallback, useRef, useState } from 'react';
import { identifyParcel, identifyZone, lookupLocation, resolveLocation } from '@/lib/geoAdmin';
import { geometryLv95ToWgs84, planarAreaM2, wgs84ToLV95 } from '@/lib/coordinates';
import type { ParcelInfo } from '@/types/parcel';

export type ParcelLoadStatus = 'idle' | 'loading' | 'loaded' | 'empty' | 'error';

/**
 * Loads parcel + zone data for a WGS84 point. The parcel identify and the
 * zone identify run in parallel; a failing zone lookup degrades gracefully
 * to "not available" instead of failing the whole parcel.
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
      const [easting, northing] = wgs84ToLV95(lat, lon);
      const [parcelResult, zoneResult, locationResult] = await Promise.allSettled([
        identifyParcel(easting, northing),
        identifyZone(easting, northing),
        lookupLocation(easting, northing),
      ]);
      if (id !== requestId.current) return; // a newer request superseded this one

      if (parcelResult.status === 'rejected') throw parcelResult.reason;
      const raw = parcelResult.value;
      if (!raw) {
        setParcel(null);
        setZone(null);
        setStatus('empty');
        return;
      }

      // Resolve the address against the parcel EGRID so it belongs to *this*
      // parcel and not a neighbouring building within tolerance.
      const location =
        locationResult.status === 'fulfilled'
          ? resolveLocation(locationResult.value, raw.egrid)
          : { address: null, plz: null, place: null, gemeinde: null };

      setZone(zoneResult.status === 'fulfilled' ? zoneResult.value : null);
      setParcel({
        egrid: raw.egrid || `${raw.canton}-${raw.number}`,
        number: raw.number,
        canton: raw.canton,
        label: raw.number ? `Parzelle ${raw.number} (${raw.canton})` : raw.egrid,
        areaM2: raw.geometry ? Math.round(planarAreaM2(raw.geometry)) : 0,
        geoportalUrl: raw.geoportalUrl,
        geometryWgs84: raw.geometry ? geometryLv95ToWgs84(raw.geometry) : null,
        address: location.address,
        plz: location.plz,
        place: location.place,
        gemeinde: location.gemeinde,
        lat,
        lon,
        lv95: [easting, northing],
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
