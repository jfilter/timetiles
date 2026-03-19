/**
 * Hook combining useState with an onChange handler for form inputs.
 *
 * Eliminates the repetitive useState + useCallback pattern in form components.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useState } from "react";

/**
 * Returns a [value, onChange, setValue] tuple for a text input field.
 *
 * @param initialValue - Initial field value (default: "")
 * @param onValueChange - Optional callback fired on every change (e.g., mutation `reset` to clear error/success state)
 *
 * @example
 * ```tsx
 * // Basic usage (auth forms)
 * const [email, onEmailChange] = useInputState();
 *
 * // With reset callback (account forms)
 * const { reset } = useMutation({ ... });
 * const [email, onEmailChange, setEmail] = useInputState("", reset);
 * ```
 */
export const useInputState = (initialValue = "", onValueChange?: () => void) => {
  const [value, setValue] = useState(initialValue);
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    onValueChange?.();
  };
  return [value, onChange, setValue] as const;
};
