/**
 * Unit tests for the webhook registry service.
 *
 * Covers:
 * - token generation (plaintext format)
 * - hashWebhookToken (SHA-256 hex, deterministic, different inputs → different outputs)
 * - handleWebhookTokenLifecycle (stores hash in `webhookToken`, plaintext in
 *   virtual `webhookTokenPlaintext`; clears both on disable)
 * - computeWebhookUrl (reads virtual plaintext field, never the stored hash)
 *
 * @module
 * @category Tests
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetEnv } from "@/lib/config/env";
import {
  computeWebhookUrl,
  generateWebhookToken,
  handleWebhookTokenLifecycle,
  hashWebhookToken,
  readWebhookTokenPlaintext,
} from "@/lib/services/webhook-registry";

const HEX_64 = /^[a-f0-9]{64}$/;

describe("generateWebhookToken", () => {
  it("returns a 64-character hex string", () => {
    const token = generateWebhookToken();

    expect(token).toHaveLength(64);
    expect(token).toMatch(HEX_64);
  });

  it("returns different values on each call", () => {
    const token1 = generateWebhookToken();
    const token2 = generateWebhookToken();

    expect(token1).not.toBe(token2);
  });
});

describe("hashWebhookToken", () => {
  it("returns a 64-character hex (SHA-256) string", () => {
    const hash = hashWebhookToken("some-plaintext");

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(HEX_64);
  });

  it("is deterministic: same input → same hash", () => {
    const a = hashWebhookToken("abc");
    const b = hashWebhookToken("abc");

    expect(a).toBe(b);
  });

  it("produces different hashes for different inputs", () => {
    const a = hashWebhookToken("abc");
    const b = hashWebhookToken("abd");

    expect(a).not.toBe(b);
  });

  it("does not leak plaintext into the hash", () => {
    const plaintext = "super-secret-plaintext";

    expect(hashWebhookToken(plaintext)).not.toContain(plaintext);
  });
});

describe("handleWebhookTokenLifecycle", () => {
  it("stores the hash in webhookToken and stashes plaintext on req.context on first enable", () => {
    const data: Record<string, unknown> = { webhookEnabled: true };
    const req: { context?: Record<string, unknown> } = {};

    handleWebhookTokenLifecycle(data, undefined, req);

    expect(typeof data.webhookToken).toBe("string");
    expect(data.webhookToken as string).toMatch(HEX_64);

    // Plaintext lives only on req.context; readWebhookTokenPlaintext surfaces it.
    const plaintext = readWebhookTokenPlaintext(req);
    expect(plaintext).toMatch(HEX_64);
    // Stored hash matches hash(plaintext).
    expect(data.webhookToken).toBe(hashWebhookToken(plaintext!));
    // The plaintext is never written to the data object that gets persisted.
    expect(data.webhookTokenPlaintext).toBeUndefined();
  });

  it("rotates on re-enable — fresh hash + fresh plaintext on req.context", () => {
    const originalDoc: Record<string, unknown> = { webhookEnabled: false, webhookToken: null };
    const data: Record<string, unknown> = { webhookEnabled: true, webhookToken: "stale-placeholder-value" };
    const req: { context?: Record<string, unknown> } = {};

    handleWebhookTokenLifecycle(data, originalDoc, req);

    expect(data.webhookToken as string).toMatch(HEX_64);
    const plaintext = readWebhookTokenPlaintext(req);
    expect(plaintext).toMatch(HEX_64);
    expect(data.webhookToken).not.toBe("stale-placeholder-value");
    expect(data.webhookToken).toBe(hashWebhookToken(plaintext!));
  });

  it("clears the stored token when disabling", () => {
    const originalDoc: Record<string, unknown> = { webhookEnabled: true, webhookToken: "some-hash" };
    const data: Record<string, unknown> = { webhookEnabled: false };
    const req: { context?: Record<string, unknown> } = {};

    handleWebhookTokenLifecycle(data, originalDoc, req);

    expect(data.webhookToken).toBeNull();
    // No plaintext surfaced after disable.
    expect(readWebhookTokenPlaintext(req)).toBeNull();
  });

  it("does not generate a new token when webhook stays enabled and hash is already set", () => {
    const existingHash = hashWebhookToken("previously-generated-plaintext");
    const originalDoc: Record<string, unknown> = { webhookEnabled: true, webhookToken: existingHash };
    const data: Record<string, unknown> = { webhookEnabled: true, webhookToken: existingHash };
    const req: { context?: Record<string, unknown> } = {};

    handleWebhookTokenLifecycle(data, originalDoc, req);

    expect(data.webhookToken).toBe(existingHash);
    // No plaintext should appear — admins cannot re-view the URL on an untouched save.
    expect(readWebhookTokenPlaintext(req)).toBeNull();
  });

  it("does nothing when webhook stays disabled", () => {
    const originalDoc: Record<string, unknown> = { webhookEnabled: false };
    const data: Record<string, unknown> = { webhookEnabled: false };
    const req: { context?: Record<string, unknown> } = {};

    handleWebhookTokenLifecycle(data, originalDoc, req);

    expect(data.webhookToken).toBeUndefined();
    expect(readWebhookTokenPlaintext(req)).toBeNull();
  });
});

describe("readWebhookTokenPlaintext", () => {
  it("returns null when context is absent", () => {
    expect(readWebhookTokenPlaintext(undefined)).toBeNull();
    expect(readWebhookTokenPlaintext({})).toBeNull();
    expect(readWebhookTokenPlaintext({ context: {} })).toBeNull();
  });

  it("returns the stashed plaintext when present", () => {
    const req: { context?: Record<string, unknown> } = {};
    handleWebhookTokenLifecycle({ webhookEnabled: true }, undefined, req);
    expect(readWebhookTokenPlaintext(req)).toMatch(HEX_64);
  });
});

describe("computeWebhookUrl", () => {
  const originalEnv = process.env.NEXT_PUBLIC_PAYLOAD_URL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_PAYLOAD_URL;
    resetEnv();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_PAYLOAD_URL = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_PAYLOAD_URL;
    }
  });

  it("returns the URL when webhookEnabled and the virtual plaintext is present", () => {
    const plaintext = "a".repeat(64);
    const data: Record<string, unknown> = {
      webhookEnabled: true,
      webhookToken: hashWebhookToken(plaintext),
      webhookTokenPlaintext: plaintext,
    };

    const url = computeWebhookUrl(data);

    expect(url).toBe(`http://localhost:3000/api/webhooks/trigger/${plaintext}`);
  });

  it("returns null when only the stored hash is available (post-save, plaintext gone)", () => {
    const data: Record<string, unknown> = {
      webhookEnabled: true,
      webhookToken: hashWebhookToken("some-plaintext"),
      // webhookTokenPlaintext intentionally absent
    };

    expect(computeWebhookUrl(data)).toBeNull();
  });

  it("returns null when webhookEnabled=false even if plaintext is present", () => {
    const data: Record<string, unknown> = { webhookEnabled: false, webhookTokenPlaintext: "x".repeat(64) };

    expect(computeWebhookUrl(data)).toBeNull();
  });

  it("returns null when data is undefined", () => {
    expect(computeWebhookUrl(undefined)).toBeNull();
  });

  it("uses NEXT_PUBLIC_PAYLOAD_URL env var if set", () => {
    process.env.NEXT_PUBLIC_PAYLOAD_URL = "https://example.com";
    resetEnv();

    const plaintext = "b".repeat(64);
    const data: Record<string, unknown> = {
      webhookEnabled: true,
      webhookToken: hashWebhookToken(plaintext),
      webhookTokenPlaintext: plaintext,
    };

    expect(computeWebhookUrl(data)).toBe(`https://example.com/api/webhooks/trigger/${plaintext}`);
  });
});
