/**
 * Trust level constants shared across config and quota modules.
 *
 * Extracted to its own module to avoid circular imports between
 * `app-config.ts` (which defines default quotas per trust level)
 * and `quota-constants.ts` (which re-exports trust levels alongside
 * quota descriptors and reads from `getAppConfig()`).
 *
 * @module
 * @category Constants
 */

/**
 * Trust levels for users, determining their access and resource limits.
 */
export const TRUST_LEVELS = { UNTRUSTED: 0, BASIC: 1, REGULAR: 2, TRUSTED: 3, POWER_USER: 4, UNLIMITED: 5 } as const;

export type TrustLevel = (typeof TRUST_LEVELS)[keyof typeof TRUST_LEVELS];
