'use client';

import { useEffect, useState } from 'react';
import type { WatchlistEntry } from '@/types/parcel';

const STORAGE_KEY = 'parcel-watchlist-v1';

function persist(entries: WatchlistEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or unavailable — the in-memory list still works.
  }
}

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);

  // Loaded in an effect (not in the initializer) so server and client render
  // the same initial HTML — avoids a hydration mismatch.
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
      if (Array.isArray(stored)) setWatchlist(stored);
    } catch {
      // Corrupt storage — start with an empty list.
    }
  }, []);

  const add = (entry: WatchlistEntry) => {
    setWatchlist((prev) => {
      const updated = [entry, ...prev.filter((e) => e.egrid !== entry.egrid)];
      persist(updated);
      return updated;
    });
  };

  const remove = (egrid: string) => {
    setWatchlist((prev) => {
      const updated = prev.filter((e) => e.egrid !== egrid);
      persist(updated);
      return updated;
    });
  };

  const updateNotes = (egrid: string, notes: string) => {
    setWatchlist((prev) => {
      const updated = prev.map((e) => (e.egrid === egrid ? { ...e, notes } : e));
      persist(updated);
      return updated;
    });
  };

  const isStarred = (egrid: string) => watchlist.some((e) => e.egrid === egrid);

  return { watchlist, add, remove, updateNotes, isStarred };
}
