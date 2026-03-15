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

import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query.
 *
 * @param query - A valid media query string (e.g. `"(min-width: 768px)"`)
 * @returns `null` on the server / before hydration, then `boolean`
 */
export const useMediaQuery = (query: string): boolean | null => {
  const [matches, setMatches] = useState<boolean | null>(null);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
};
