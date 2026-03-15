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
 * @example
 * ```tsx
 * const [email, onEmailChange] = useInputState();
 * return <Input value={email} onChange={onEmailChange} />;
 * ```
 */
export const useInputState = (initialValue = "") => {
  const [value, setValue] = useState(initialValue);
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value);
  return [value, onChange, setValue] as const;
};
