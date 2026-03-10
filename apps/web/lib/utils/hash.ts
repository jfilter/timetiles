/**
 * Shared cryptographic hash utilities for PII protection.
 *
 * @module
 * @category Utils
 */
import { createHash } from "crypto";

/** Hash an email address (lowercased and trimmed) using SHA-256. */
export const hashEmail = (email: string): string =>
  createHash("sha256").update(email.toLowerCase().trim()).digest("hex");

/** Hash an IP address using SHA-256. */
export const hashIpAddress = (ip: string): string => createHash("sha256").update(ip).digest("hex");
