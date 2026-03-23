/**
 * Returns the application base URL from environment.
 *
 * @module
 * @category Utils
 */
import { getEnv } from "@/lib/config/env";

/**
 * Get the application base URL from `NEXT_PUBLIC_PAYLOAD_URL`.
 * Falls back to `http://localhost:3000` in development.
 */
export const getBaseUrl = (): string => getEnv().NEXT_PUBLIC_PAYLOAD_URL;
