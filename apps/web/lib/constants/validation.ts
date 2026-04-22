/**
 * Shared validation constants for authentication and form validation.
 *
 * @module
 * @category Constants
 */

import { PASSWORD_MIN_LENGTH } from "@/lib/security/password-policy-constants";

/**
 * Validate a password and its confirmation value.
 *
 * Throws an `Error` when the password is too short or when the two
 * values do not match.  Designed to be called inside a `mutationFn` so the
 * thrown error surfaces through the form's error state.
 */
export const validatePasswords = (password: string, confirmPassword: string): void => {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }

  // eslint-disable-next-line security/detect-possible-timing-attacks -- Client-side form validation, not cryptographic comparison
  if (password !== confirmPassword) {
    throw new Error("Passwords do not match");
  }
};
