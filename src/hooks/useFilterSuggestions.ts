import type { FilterOption } from '@libs/filterInputs';
import { useEffect, useRef, useState } from 'react';

import type { Plugin } from '@/types/plugin';

const DEBOUNCE_MS = 250;
const TIMEOUT_MS = 5_000;
const MAX_CACHE_ENTRIES = 50;
const BACKOFF_MS = [0, 2_000, 5_000, 10_000, 30_000];

type UseFilterSuggestionsArgs = {
  plugin?: Plugin.PluginSource;
  filterKey: string;
  query: string;
  enabled: boolean;
};

export function useFilterSuggestions({
  plugin,
  filterKey,
  query,
  enabled,
}: UseFilterSuggestionsArgs) {
  const [suggestions, setSuggestions] = useState<FilterOption[]>([]);
  const [loading, setLoading] = useState(false);

  const cacheRef = useRef<Map<string, FilterOption[]>>(new Map());
  const requestIdRef = useRef(0);
  const failureCountRef = useRef(0);
  const blockedUntilRef = useRef(0);

  useEffect(() => {
    cacheRef.current.clear();
    failureCountRef.current = 0;
    blockedUntilRef.current = 0;
    setSuggestions([]);
    setLoading(false);
  }, [plugin?.id, filterKey]);

  useEffect(() => {
    const getSuggestions = plugin?.getFilterSuggestions;
    const trimmed = query.trim();
    if (!enabled || typeof getSuggestions !== 'function' || !trimmed) {
      requestIdRef.current += 1;
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const cacheKey = `${plugin?.id ?? ''}\0${filterKey}\0${trimmed}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setSuggestions(cached);
      setLoading(false);
      return;
    }

    if (Date.now() < blockedUntilRef.current) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const reqId = ++requestIdRef.current;
    let active = true;
    const timer = window.setTimeout(async () => {
      if (!active || requestIdRef.current !== reqId) return;
      setLoading(true);
      let timeoutId: number | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(
            () => reject(new Error('Suggestion request timed out')),
            TIMEOUT_MS,
          );
        });
        const raw = await Promise.race([
          getSuggestions.call(plugin, filterKey, trimmed),
          timeout,
        ]);
        if (!active || requestIdRef.current !== reqId) return;
        const normalized = Array.isArray(raw)
          ? raw.filter(
              (item): item is FilterOption =>
                !!item &&
                typeof item.value === 'string' &&
                item.value.length > 0 &&
                typeof item.label === 'string',
            )
          : [];
        failureCountRef.current = 0;
        blockedUntilRef.current = 0;
        if (cacheRef.current.size >= MAX_CACHE_ENTRIES) {
          const oldestKey = cacheRef.current.keys().next().value;
          if (oldestKey !== undefined) cacheRef.current.delete(oldestKey);
        }
        cacheRef.current.set(cacheKey, normalized);
        setSuggestions(normalized);
      } catch {
        if (!active || requestIdRef.current !== reqId) return;
        failureCountRef.current += 1;
        const backoff =
          BACKOFF_MS[Math.min(failureCountRef.current, BACKOFF_MS.length - 1)];
        blockedUntilRef.current = Date.now() + backoff;
        setSuggestions([]);
      } finally {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        if (active && requestIdRef.current === reqId) {
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [plugin, filterKey, query, enabled]);

  return { suggestions, loading };
}
