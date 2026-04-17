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
