/**
 * Custom React hooks for debouncing values.
 *
 * Debouncing is a technique to limit the rate at which a function gets called. These hooks
 * are useful for performance optimization, especially with user inputs that can change rapidly,
 * such as search fields, map interactions, or filter adjustments. By delaying the update of a
 * value, they prevent excessive re-renders or API calls.
 *
 * @category React Hooks
 * @module
 */
import { useEffect, useRef, useState } from "react";

/**
 * Custom hook to debounce a value.
 *
 * Useful for preventing excessive API calls during rapid value changes
 * like map panning/zooming, search input, or filter changes.
 *
 * @param value - The value to debounce.
 * @param delay - Delay in milliseconds. Recommended values:
 *   - 300ms for map interactions (pan/zoom)
 *   - 500ms for search inputs
 *   - 150ms for filter changes.
 * @returns The debounced value.
 *
 * @example
 * ```tsx
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearchTerm = useDebounce(searchTerm, 500);
 *
 * useEffect(() => {
 *   // This will only run 500ms after the user stops typing
 *   searchAPI(debouncedSearchTerm);
 * }, [debouncedSearchTerm]);
 * ```
 */
export const useDebounce = <T>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  // Leading-edge on the very first non-initial change: the debounce
  // semantic is "collapse rapid sequential updates", so we should fire
  // the first transition immediately and only delay subsequent ones.
  // Without this, map viewport bounds, filter changes, and similar
  // inputs all pay an artificial `delay` latency on initial page load
  // — long enough to push skeletons / loading states past their test
  // windows and, more importantly, noticeable to real users.
  const hasFiredRef = useRef(false);

  useEffect(() => {
    if (!hasFiredRef.current) {
      hasFiredRef.current = true;
      setDebouncedValue(value);
      return;
    }
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};
