// @vitest-environment node
/**
 * Unit tests for cryptographic hash utilities.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { hashEmail, hashIpAddress } from "@/lib/utils/hash";

describe.sequential("hashEmail", () => {
  it("produces a consistent SHA-256 hex digest", () => {
    const hash = hashEmail("test@example.com");

    expect(hash).toBe("973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b");
  });

  it("lowercases the email before hashing", () => {
    const lower = hashEmail("test@example.com");
    const mixed = hashEmail("Test@Example.COM");

    expect(mixed).toBe(lower);
  });

  it("trims whitespace before hashing", () => {
    const trimmed = hashEmail("test@example.com");
    const padded = hashEmail("  test@example.com  ");

    expect(padded).toBe(trimmed);
  });

  it("lowercases AND trims simultaneously", () => {
    const canonical = hashEmail("test@example.com");
    const messy = hashEmail("  TEST@EXAMPLE.COM  ");

    expect(messy).toBe(canonical);
  });

  it("returns a 64-character hex string", () => {
    const hash = hashEmail("any@email.com");

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different hashes for different emails", () => {
    const hash1 = hashEmail("alice@example.com");
    const hash2 = hashEmail("bob@example.com");

    expect(hash1).not.toBe(hash2);
  });
});

describe.sequential("hashIpAddress", () => {
  it("produces a consistent SHA-256 hex digest", () => {
    const hash = hashIpAddress("192.168.1.1");

    expect(hash).toBe("c5eb5a4cc76a5cdb16e79864b9ccd26c3553f0c396d0a21bafb7be71c1efcd8c");
  });

  it("returns a 64-character hex string", () => {
    const hash = hashIpAddress("10.0.0.1");

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different hashes for different IPs", () => {
    const hash1 = hashIpAddress("192.168.1.1");
    const hash2 = hashIpAddress("10.0.0.1");

    expect(hash1).not.toBe(hash2);
  });

  it("hashes IPv6 addresses", () => {
    const hash = hashIpAddress("::1");

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
