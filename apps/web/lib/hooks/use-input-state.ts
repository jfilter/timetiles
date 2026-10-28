/**
 * Hook combining useState with an onChange handler for form inputs.
 *
 * Eliminates the repetitive useState + useCallback pattern in form components.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useCallback, useState } from "react";

/**
 * Returns a [value, inputProps, setValue] tuple for a text input field. Spread `inputProps` onto
 * the input: besides value and onChange, its ref adopts a value autofilled or typed before
 * hydration, which sits in the DOM without ever reaching state.
 *
 * @param initialValue - Initial field value (default: "")
 * @param onValueChange - Optional callback fired on every change (e.g., mutation `reset` to clear error/success state)
 *
 * @example
 * ```tsx
 * // Basic usage (auth forms)
 * const [email, emailInput] = useInputState();
 * <Input type="email" {...emailInput} />
 *
 * // With reset callback (account forms)
 * const { reset } = useMutation({ ... });
 * const [email, emailInput, setEmail] = useInputState("", reset);
 * ```
 */
export const useInputState = (initialValue = "", onValueChange?: () => void) => {
  const [value, setValue] = useState(initialValue);
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    onValueChange?.();
  };
  const ref = useCallback((input: HTMLInputElement | null) => {
    if (input?.value) setValue(input.value);
  }, []);
  return [value, { value, onChange, ref }, setValue] as const;
};
