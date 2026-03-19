/**
 * Shared loading state management for list components.
 *
 * Tracks per-item loading states (e.g., "syncing", "deleting") using a
 * Record keyed by item ID. Used by schedules and scrapers list components.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useCallback, useState } from "react";

export const useLoadingStates = () => {
  const [states, setStates] = useState<Record<number, string>>({});

  const setLoading = useCallback((id: number, state: string) => {
    setStates((prev) => ({ ...prev, [id]: state }));
  }, []);

  const clearLoading = useCallback((id: number) => {
    setStates((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  return { states, setLoading, clearLoading };
};
