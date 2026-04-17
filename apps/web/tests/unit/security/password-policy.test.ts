/**
 * Unit tests for the centralized password policy (ADR 0039).
 *
 * Covers length bounds and the HIBP k-anonymity flow, including the
 * fail-open behavior on network errors.
 *
 * @module
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnv } from "@/lib/config/env";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  validatePassword,
  validatePasswordLengthOnly,
} from "@/lib/security/password-policy";

describe("password-policy", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Default: HIBP check disabled so length-only tests don't touch the network.
    process.env.PASSWORD_HIBP_CHECK = "false";
    resetEnv();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.PASSWORD_HIBP_CHECK;
    resetEnv();
  });

  describe("validatePasswordLengthOnly", () => {
    it("rejects passwords below the minimum length", () => {
      const result = validatePasswordLengthOnly("a".repeat(PASSWORD_MIN_LENGTH - 1));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("too-short");
    });

    it("accepts passwords at the minimum length", () => {
      const result = validatePasswordLengthOnly("a".repeat(PASSWORD_MIN_LENGTH));
      expect(result.ok).toBe(true);
    });

    it("rejects passwords above the maximum length", () => {
      const result = validatePasswordLengthOnly("a".repeat(PASSWORD_MAX_LENGTH + 1));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("too-long");
    });

    it("accepts passwords at the maximum length", () => {
      const result = validatePasswordLengthOnly("a".repeat(PASSWORD_MAX_LENGTH));
      expect(result.ok).toBe(true);
    });
  });

  describe("validatePassword with HIBP disabled", () => {
    it("accepts a well-formed password", async () => {
      const result = await validatePassword("goodPassword12");
      expect(result.ok).toBe(true);
    });

    it("rejects a password below the minimum length before any HIBP call", async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy as unknown as typeof fetch;
      const result = await validatePassword("short");
      expect(result.ok).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("validatePassword with HIBP enabled", () => {
    beforeEach(() => {
      process.env.PASSWORD_HIBP_CHECK = "true";
      resetEnv();
    });

    it("rejects a password the HIBP range API reports as compromised", async () => {
      // SHA-1 of "password12345" -> F520...
      const sha1 = await import("node:crypto").then((m) =>
        m.createHash("sha1").update("password12345").digest("hex").toUpperCase()
      );
      const suffix = sha1.slice(5);
      globalThis.fetch = vi.fn(() =>
        Promise.resolve(new Response(`${suffix}:1234\r\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:5`, { status: 200 }))
      ) as unknown as typeof fetch;

      const result = await validatePassword("password12345");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("compromised");
    });

    it("accepts a password the HIBP API does not report", async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve(new Response("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:5", { status: 200 }))
      ) as unknown as typeof fetch;

      const result = await validatePassword("uniqueStrongPassword12");
      expect(result.ok).toBe(true);
    });

    it("ignores padding entries (count=0) from the range API", async () => {
      const sha1 = await import("node:crypto").then((m) =>
        m.createHash("sha1").update("paddingTest12345").digest("hex").toUpperCase()
      );
      const suffix = sha1.slice(5);
      globalThis.fetch = vi.fn(() =>
        Promise.resolve(new Response(`${suffix}:0`, { status: 200 }))
      ) as unknown as typeof fetch;

      const result = await validatePassword("paddingTest12345");
      expect(result.ok).toBe(true);
    });

    it("fails open when HIBP returns a non-OK response", async () => {
      globalThis.fetch = vi.fn(() => Promise.resolve(new Response("", { status: 503 }))) as unknown as typeof fetch;

      const result = await validatePassword("networkFailedPassword12");
      expect(result.ok).toBe(true);
    });

    it("fails open when the HIBP fetch throws", async () => {
      globalThis.fetch = vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch;

      const result = await validatePassword("networkFailedPassword12");
      expect(result.ok).toBe(true);
    });
  });
});
