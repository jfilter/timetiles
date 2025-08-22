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
import { useEffect, useState } from "react";

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

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

/**
 * Debounce hook with deep comparison for objects.
 *
 * Useful when you need to debounce objects and want to avoid
 * unnecessary updates when object contents haven't actually changed.
 *
 * @param value - The value to debounce.
 * @param delay - Delay in milliseconds.
 * @param compare - Custom comparison function (optional).
 * @returns The debounced value.
 */
export const useDebounceWithComparison = <T>(value: T, delay: number, compare?: (prev: T, next: T) => boolean): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      // Only update if values are actually different
      if (compare ? !compare(debouncedValue, value) : debouncedValue !== value) {
        setDebouncedValue(value);
      }
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay, debouncedValue, compare]);

  return debouncedValue;
};
