'use client';

import { useEffect, useState } from 'react';
import type { ParcelComment, WatchlistEntry } from '@/types/parcel';

const STORAGE_KEY = 'parcel-watchlist-v1';

/** Reasonably unique id for a comment (crypto when available). */
function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/** Turns a legacy single-string `notes` field into the new comments list. */
function migrateEntry(entry: WatchlistEntry): WatchlistEntry {
  if (entry.comments) return entry;
  const legacy = entry.notes?.trim();
  const { notes: _drop, ...rest } = entry;
  return {
    ...rest,
    comments: legacy
      ? [{ id: uid(), text: legacy, createdAt: entry.addedAt }]
      : [],
  };
}

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
      if (Array.isArray(stored)) setWatchlist(stored.map(migrateEntry));
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

  /** Patches an existing entry; ignored if the egrid is not on the list. */
  const updateEntry = (egrid: string, patch: Partial<WatchlistEntry>) => {
    setWatchlist((prev) => {
      const updated = prev.map((e) => (e.egrid === egrid ? { ...e, ...patch } : e));
      persist(updated);
      return updated;
    });
  };

  /** Updates the comments array of an entry via a transform function. */
  const mapComments = (
    egrid: string,
    fn: (comments: ParcelComment[]) => ParcelComment[]
  ) => {
    setWatchlist((prev) => {
      const updated = prev.map((e) =>
        e.egrid === egrid ? { ...e, comments: fn(e.comments ?? []) } : e
      );
      persist(updated);
      return updated;
    });
  };

  const addComment = (egrid: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    mapComments(egrid, (comments) => [
      ...comments,
      { id: uid(), text: trimmed, createdAt: new Date().toISOString() },
    ]);
  };

  const updateComment = (egrid: string, commentId: string, text: string) => {
    const trimmed = text.trim();
    mapComments(egrid, (comments) =>
      comments.map((c) =>
        c.id === commentId
          ? { ...c, text: trimmed, updatedAt: new Date().toISOString() }
          : c
      )
    );
  };

  const removeComment = (egrid: string, commentId: string) => {
    mapComments(egrid, (comments) => comments.filter((c) => c.id !== commentId));
  };

  const isStarred = (egrid: string) => watchlist.some((e) => e.egrid === egrid);

  const getEntry = (egrid: string) => watchlist.find((e) => e.egrid === egrid);

  return {
    watchlist,
    add,
    remove,
    updateEntry,
    addComment,
    updateComment,
    removeComment,
    isStarred,
    getEntry,
  };
}
