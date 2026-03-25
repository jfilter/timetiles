/**
 * Hook for copying text to the clipboard with auto-resetting feedback state.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Duration to show "copied" feedback before resetting to idle. */
const FEEDBACK_MS = 2000;

/**
 * Copy text to the clipboard and get transient feedback state.
 *
 * @returns `copy` — async function that writes to clipboard;
 *          `isCopied` — true for {@link FEEDBACK_MS} after a successful copy;
 *          `error` — set briefly on failure.
 */
export const useClipboard = () => {
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Clean up pending timer on unmount
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const scheduleReset = (setter: (v: boolean) => void) => {
    timerRef.current = setTimeout(() => setter(false), FEEDBACK_MS);
  };

  const copy = useCallback(async (text: string) => {
    clearTimeout(timerRef.current);
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setError(false);
      scheduleReset(setIsCopied);
    } catch {
      setError(true);
      scheduleReset(setError);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scheduleReset is stable (captures ref)
  }, []);

  return { copy, isCopied, error } as const;
};
