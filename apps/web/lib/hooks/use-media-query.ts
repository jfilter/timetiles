/**
 * SSR-safe media query hook.
 *
 * Returns `null` until the media query can be evaluated (after hydration),
 * then tracks the current match state reactively.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useCallback, useSyncExternalStore } from "react";

const getServerSnapshot = () => null;

/**
 * Subscribe to a CSS media query.
 *
 * @param query - A valid media query string (e.g. `"(min-width: 768px)"`)
 * @returns `null` on the server / before hydration, then `boolean`
 */
export const useMediaQuery = (query: string): boolean | null => {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );

  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, getServerSnapshot);
};
