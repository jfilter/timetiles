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
  // The initial value is available immediately (via `useState(value)`), so first
  // render pays no artificial `delay` latency. The mount-time effect run below is
  // a no-op pass-through that simply marks the first render as handled — it must
  // NOT schedule a timer, otherwise the very first paint would flash the initial
  // value and then re-set it `delay` ms later. Every subsequent value change is
  // trailing-debounced: rapid sequential updates collapse into a single update
  // that fires `delay` ms after the last change.
  //
  // Note: this is intentionally trailing-on-change (not leading). Leading-edge on
  // the first change would fire e.g. a search request on the first keystroke,
  // which is the opposite of what these inputs want. The unit tests in
  // use-debounce.test.ts encode this trailing contract.
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
