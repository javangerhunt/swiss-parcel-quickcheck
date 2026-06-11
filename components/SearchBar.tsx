'use client';

import { useEffect, useRef, useState } from 'react';
import { searchLocations } from '@/lib/geoAdmin';
import type { SearchResult } from '@/types/parcel';

interface SearchBarProps {
  onSelect: (result: SearchResult) => void;
}

export function SearchBar({ onSelect }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const skipNextSearch = useRef(false);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setFailed(false);
      try {
        const found = await searchLocations(trimmed, controller.signal);
        setResults(found);
        setOpen(true);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setResults([]);
          setFailed(true);
          setOpen(true);
        }
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (result: SearchResult) => {
    skipNextSearch.current = true;
    setQuery(result.label);
    setOpen(false);
    onSelect(result);
  };

  return (
    <div className="absolute left-4 right-4 top-4 z-[1100] md:right-auto md:w-96">
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Adresse oder Parzelle suchen (z.B. «Hünenberg 1234»)"
        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm shadow-md outline-none placeholder:text-gray-400 focus:border-red-500"
      />
      {loading && (
        <span className="absolute right-3 top-2.5 text-sm text-gray-400">…</span>
      )}
      {open && (
        <ul className="mt-1 max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {failed && (
            <li className="px-4 py-2.5 text-sm text-red-600">
              Suche fehlgeschlagen — bitte erneut versuchen.
            </li>
          )}
          {!failed && results.length === 0 && (
            <li className="px-4 py-2.5 text-sm text-gray-500">Keine Treffer.</li>
          )}
          {results.map((result, index) => (
            <li key={`${result.detail}-${index}`}>
              <button
                type="button"
                onClick={() => handleSelect(result)}
                className="block w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50"
              >
                {result.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
