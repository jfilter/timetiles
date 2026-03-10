/**
 * Field-level encryption utilities for sensitive data at rest.
 *
 * Uses AES-256-GCM authenticated encryption, keyed by PAYLOAD_SECRET.
 * Encrypted values are stored as `iv:authTag:ciphertext` (hex-encoded).
 *
 * @module
 * @category Utils
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT = "timetiles-field-encryption";
const ENCRYPTED_PATTERN = /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/;

/**
 * Derive a 256-bit encryption key from a secret string.
 * Uses scrypt with a static salt (acceptable because PAYLOAD_SECRET
 * is already a high-entropy secret, not a user password).
 */
const deriveKey = (secret: string): Buffer => scryptSync(secret, SALT, KEY_LENGTH);

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * @returns Encrypted string in format `iv:authTag:ciphertext` (hex-encoded)
 */
export const encryptField = (plaintext: string, secret: string): string => {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
};

/**
 * Decrypt an encrypted field value.
 *
 * @param encrypted - Value in format `iv:authTag:ciphertext` (hex-encoded)
 * @returns Decrypted plaintext string
 * @throws If the value is tampered with or the wrong key is used
 */
export const decryptField = (encrypted: string, secret: string): string => {
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted value format");
  }

  const ivHex = parts[0]!;
  const authTagHex = parts[1]!;
  const ciphertext = parts[2]!;
  const key = deriveKey(secret);
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  return decipher.update(ciphertext, "hex", "utf8") + decipher.final("utf8");
};

/**
 * Check whether a value appears to be encrypted (matches the `iv:authTag:ciphertext` format).
 * Used for gradual migration of existing plaintext values.
 */
export const isEncrypted = (value: string): boolean => ENCRYPTED_PATTERN.test(value);
