/**
 * Returns the application base URL from environment.
 *
 * @module
 * @category Utils
 */

const DEFAULT_BASE_URL = "http://localhost:3000";

/**
 * Get the application base URL from `NEXT_PUBLIC_PAYLOAD_URL`.
 * Falls back to `http://localhost:3000` in development.
 */
export const getBaseUrl = (): string => process.env.NEXT_PUBLIC_PAYLOAD_URL ?? DEFAULT_BASE_URL;
