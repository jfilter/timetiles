/**
 * Shared validation constants for authentication and form validation.
 *
 * @module
 * @category Constants
 */

import { PASSWORD_MIN_LENGTH } from "@/lib/security/password-policy-constants";

/** Caller-supplied, already-localized messages for {@link validatePasswords}. */
export interface PasswordValidationMessages {
  /** Shown when the password is shorter than {@link PASSWORD_MIN_LENGTH}. */
  tooShort: string;
  /** Shown when the password and its confirmation differ. */
  mismatch: string;
}

/**
 * Validate a password and its confirmation value.
 *
 * Throws an `Error` carrying a caller-supplied, already-translated message when
 * the password is too short or the two values do not match. Messages are passed
 * in because this constant module cannot use next-intl; without them German
 * users saw the raw English strings. Designed to be called inside a `mutationFn`
 * so the thrown error surfaces through the form's error state.
 */
export const validatePasswords = (
  password: string,
  confirmPassword: string,
  messages: PasswordValidationMessages
): void => {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(messages.tooShort);
  }

  // eslint-disable-next-line security/detect-possible-timing-attacks -- Client-side form validation, not cryptographic comparison
  if (password !== confirmPassword) {
    throw new Error(messages.mismatch);
  }
};
