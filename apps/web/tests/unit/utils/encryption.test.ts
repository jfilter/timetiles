/**
 * @module
 */
import { describe, expect, it } from "vitest";

import { decryptField, encryptField, isEncrypted } from "@/lib/utils/encryption";

const TEST_SECRET = "test-secret-key-for-encryption-tests";

describe("encryption", () => {
  describe("encryptField / decryptField", () => {
    it("should round-trip encrypt and decrypt", () => {
      const plaintext = "my-secret-api-key-12345";
      const encrypted = encryptField(plaintext, TEST_SECRET);
      const decrypted = decryptField(encrypted, TEST_SECRET);

      expect(decrypted).toBe(plaintext);
      expect(encrypted).not.toBe(plaintext);
    });

    it("should produce different ciphertexts for the same input (unique IVs)", () => {
      const plaintext = "same-value";
      const encrypted1 = encryptField(plaintext, TEST_SECRET);
      const encrypted2 = encryptField(plaintext, TEST_SECRET);

      expect(encrypted1).not.toBe(encrypted2);

      // Both should decrypt to the same value
      expect(decryptField(encrypted1, TEST_SECRET)).toBe(plaintext);
      expect(decryptField(encrypted2, TEST_SECRET)).toBe(plaintext);
    });

    it("should handle empty strings", () => {
      const encrypted = encryptField("", TEST_SECRET);
      const decrypted = decryptField(encrypted, TEST_SECRET);

      expect(decrypted).toBe("");
    });

    it("should handle unicode content", () => {
      const plaintext = "パスワード-🔑-密码";
      const encrypted = encryptField(plaintext, TEST_SECRET);
      const decrypted = decryptField(encrypted, TEST_SECRET);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle long values", () => {
      const plaintext = "x".repeat(10000);
      const encrypted = encryptField(plaintext, TEST_SECRET);
      const decrypted = decryptField(encrypted, TEST_SECRET);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe("tamper detection", () => {
    it("should reject modified ciphertext", () => {
      const encrypted = encryptField("secret", TEST_SECRET);
      const parts = encrypted.split(":");
      // Flip a character in the ciphertext
      const tampered = `${parts[0]}:${parts[1]}:ff${parts[2]!.slice(2)}`;

      expect(() => decryptField(tampered, TEST_SECRET)).toThrow();
    });

    it("should reject modified auth tag", () => {
      const encrypted = encryptField("secret", TEST_SECRET);
      const parts = encrypted.split(":");
      const tampered = `${parts[0]}:${"0".repeat(32)}:${parts[2]}`;

      expect(() => decryptField(tampered, TEST_SECRET)).toThrow();
    });

    it("should reject wrong secret", () => {
      const encrypted = encryptField("secret", TEST_SECRET);

      expect(() => decryptField(encrypted, "wrong-secret")).toThrow();
    });

    it("should reject invalid format", () => {
      expect(() => decryptField("not-encrypted", TEST_SECRET)).toThrow("Invalid encrypted value format");
      expect(() => decryptField("a:b", TEST_SECRET)).toThrow("Invalid encrypted value format");
    });
  });

  describe("isEncrypted", () => {
    it("should detect encrypted values", () => {
      const encrypted = encryptField("test", TEST_SECRET);
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it("should reject plaintext values", () => {
      expect(isEncrypted("my-api-key")).toBe(false);
      expect(isEncrypted("super-secret-token-12345")).toBe(false);
      expect(isEncrypted("")).toBe(false);
    });

    it("should reject partial matches", () => {
      expect(isEncrypted("abc:def:ghi")).toBe(false); // not hex
      expect(isEncrypted("abcdef123456789012345678:abcdef12345678901234567890123456:")).toBe(false); // empty ciphertext
    });
  });
});
