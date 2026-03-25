/**
 * Timing-pad utility to prevent timing side-channel attacks.
 *
 * Ensures that both success and failure paths take at least `minDurationMs`
 * to complete, preventing attackers from distinguishing outcomes based on
 * response time (e.g., user enumeration via registration or email change).
 *
 * @module
 * @category Security
 */

/**
 * Execute a function with a minimum execution time guarantee.
 *
 * @param minDurationMs - Minimum time the operation should take
 * @param fn - The async function to execute
 * @returns The result of `fn`
 *
 * @example
 * ```ts
 * // Ensure registration always takes at least 1.5s
 * const result = await withTimingPad(1500, async () => {
 *   // check user, create or send notification...
 *   return { message: "Check your email" };
 * });
 * ```
 */
/** Recommended minimum durations for timing-sensitive operations (ms). */
export const TIMING_PAD_MS = {
  /** Email change — includes duplicate check + send verification */
  EMAIL_CHANGE: 1000,
  /** Password change — verify + update */
  PASSWORD_CHANGE: 1000,
  /** Account deletion scheduling — verify + eligibility check */
  ACCOUNT_DELETION: 1000,
} as const;

export const withTimingPad = async <T>(minDurationMs: number, fn: () => Promise<T>): Promise<T> => {
  const startTime = Date.now();
  const result = await fn();
  const elapsed = Date.now() - startTime;
  if (elapsed < minDurationMs) {
    await new Promise((resolve) => setTimeout(resolve, minDurationMs - elapsed));
  }
  return result;
};
