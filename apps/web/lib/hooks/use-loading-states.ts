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
  // Per-row failure messages. Without these a row mutation that failed (a 409 from deleting
  // a running schedule, a 429 from triggering a scraper) only cleared its spinner: the list
  // did not change and nothing was shown, so the button looked broken.
  const [errors, setErrors] = useState<Record<number, string>>({});

  const clearError = useCallback((id: number) => {
    setErrors((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const setLoading = useCallback(
    (id: number, state: string) => {
      // Starting a new attempt clears the previous attempt's error.
      clearError(id);
      setStates((prev) => ({ ...prev, [id]: state }));
    },
    [clearError]
  );

  const clearLoading = useCallback((id: number) => {
    setStates((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const setError = useCallback((id: number, message: string) => {
    setErrors((prev) => ({ ...prev, [id]: message }));
  }, []);

  return { states, setLoading, clearLoading, errors, setError, clearError };
};
