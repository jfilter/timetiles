/**
 * Password policy constants and types.
 *
 * Kept separate from `password-policy.ts` so that client components can
 * read length limits without pulling server-only dependencies (`node:crypto`,
 * env accessors, loggers) into the browser bundle.
 *
 * @module
 * @category Security
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;

export type PasswordPolicyFailure =
  | { ok: false; code: "too-short"; message: string }
  | { ok: false; code: "too-long"; message: string }
  | { ok: false; code: "compromised"; message: string };

export type PasswordPolicyResult = { ok: true } | PasswordPolicyFailure;

/** Synchronous-only policy check, for places that can't await (e.g. form UX). */
export const validatePasswordLengthOnly = (password: string): PasswordPolicyResult => {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, code: "too-short", message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, code: "too-long", message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters.` };
  }
  return { ok: true };
};
