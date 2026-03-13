/**
 * Shared validation constants for authentication and form validation.
 *
 * @module
 * @category Constants
 */

export const MIN_PASSWORD_LENGTH = 8;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/;

/**
 * Validate a password and its confirmation value.
 *
 * Throws an {@link Error} when the password is too short or when the two
 * values do not match.  Designed to be called inside a `mutationFn` so the
 * thrown error surfaces through the form's error state.
 */
export const validatePasswords = (password: string, confirmPassword: string): void => {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  if (password !== confirmPassword) {
    throw new Error("Passwords do not match");
  }
};
