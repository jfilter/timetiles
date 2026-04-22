/**
 * Shared cryptographic hash utilities for PII protection.
 *
 * @module
 * @category Utils
 */
import { createHash } from "node:crypto";

const hashValue = (value: string): string => createHash("sha256").update(value).digest("hex");

/** Hash an email address (lowercased and trimmed) using SHA-256. */
export const hashEmail = (email: string): string => hashValue(email.toLowerCase().trim());

/** Hash an IP address using SHA-256. */
export const hashIpAddress = (ip: string): string => hashValue(ip);

/** Hash an opaque secret/token before writing it to logs or telemetry. */
export const hashOpaqueValue = (value: string): string => hashValue(value);

/**
 * Hash a potentially PII-containing string for safe log correlation.
 *
 * Returns a short, prefixed digest (`pii:<12 hex>`) — enough entropy that
 * operators can correlate two occurrences of the same address without the
 * raw value ever reaching log aggregation. Use for addresses, street names,
 * and any other user-supplied free text that may identify a person.
 */
export const hashForLog = (value: string): string => `pii:${hashValue(value).slice(0, 12)}`;
