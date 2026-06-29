/**
 * Unit tests for shared form validation helpers.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { validatePasswords } from "@/lib/constants/validation";
import { PASSWORD_MIN_LENGTH } from "@/lib/security/password-policy-constants";

const messages = { tooShort: "too-short-msg", mismatch: "mismatch-msg" };
const validPassword = "a".repeat(PASSWORD_MIN_LENGTH);

describe("validatePasswords", () => {
  it("passes for a long-enough, matching password", () => {
    expect(() => validatePasswords(validPassword, validPassword, messages)).not.toThrow();
  });

  it("throws the caller-supplied too-short message when below the minimum", () => {
    const short = "a".repeat(PASSWORD_MIN_LENGTH - 1);
    expect(() => validatePasswords(short, short, messages)).toThrow("too-short-msg");
  });

  it("throws the caller-supplied mismatch message when confirmation differs", () => {
    expect(() => validatePasswords(validPassword, validPassword + "x", messages)).toThrow("mismatch-msg");
  });

  it("checks length before match (a too-short mismatch reports too-short)", () => {
    expect(() => validatePasswords("abc", "different", messages)).toThrow("too-short-msg");
  });
});
