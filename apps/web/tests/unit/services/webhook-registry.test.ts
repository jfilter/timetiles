/**
 * Unit tests for the webhook registry service.
 *
 * Tests cover token generation, token lifecycle management (enable/disable/rotate),
 * and webhook URL computation.
 *
 * @module
 * @category Tests
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetEnv } from "@/lib/config/env";
import { computeWebhookUrl, generateWebhookToken, handleWebhookTokenLifecycle } from "@/lib/services/webhook-registry";

describe("generateWebhookToken", () => {
  it("returns a 64-character hex string", () => {
    const token = generateWebhookToken();

    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns different values on each call", () => {
    const token1 = generateWebhookToken();
    const token2 = generateWebhookToken();

    expect(token1).not.toBe(token2);
  });
});

describe("handleWebhookTokenLifecycle", () => {
  it("generates token when webhookEnabled=true and no existing token", () => {
    const data: Record<string, unknown> = { webhookEnabled: true };

    handleWebhookTokenLifecycle(data);

    expect(data.webhookToken).toBeDefined();
    expect(typeof data.webhookToken).toBe("string");
    expect(data.webhookToken as string).toHaveLength(64);
  });

  it("regenerates token when re-enabling (was disabled, now enabled)", () => {
    const originalDoc: Record<string, unknown> = { webhookEnabled: false, webhookToken: null };
    const data: Record<string, unknown> = { webhookEnabled: true, webhookToken: "old-token-that-should-be-replaced" };

    handleWebhookTokenLifecycle(data, originalDoc);

    expect(data.webhookToken).toBeDefined();
    expect(typeof data.webhookToken).toBe("string");
    expect(data.webhookToken as string).toHaveLength(64);
    expect(data.webhookToken).not.toBe("old-token-that-should-be-replaced");
  });

  it("clears token (sets null) when disabling", () => {
    const originalDoc: Record<string, unknown> = { webhookEnabled: true, webhookToken: "existing-token-abc123" };
    const data: Record<string, unknown> = { webhookEnabled: false };

    handleWebhookTokenLifecycle(data, originalDoc);

    expect(data.webhookToken).toBeNull();
  });

  it("does nothing when webhookEnabled stays true and token already exists", () => {
    const existingToken = "a".repeat(64);
    const originalDoc: Record<string, unknown> = { webhookEnabled: true, webhookToken: existingToken };
    const data: Record<string, unknown> = { webhookEnabled: true, webhookToken: existingToken };

    handleWebhookTokenLifecycle(data, originalDoc);

    expect(data.webhookToken).toBe(existingToken);
  });

  it("does nothing when webhookEnabled stays false", () => {
    const originalDoc: Record<string, unknown> = { webhookEnabled: false };
    const data: Record<string, unknown> = { webhookEnabled: false };

    handleWebhookTokenLifecycle(data, originalDoc);

    expect(data.webhookToken).toBeUndefined();
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

  it("returns URL when webhookEnabled=true and webhookToken exists", () => {
    const data: Record<string, unknown> = { webhookEnabled: true, webhookToken: "abc123" };

    const url = computeWebhookUrl(data);

    expect(url).toBe("http://localhost:3000/api/webhooks/trigger/abc123");
  });

  it("returns null when webhookEnabled=false", () => {
    const data: Record<string, unknown> = { webhookEnabled: false, webhookToken: "abc123" };

    const url = computeWebhookUrl(data);

    expect(url).toBeNull();
  });

  it("returns null when webhookToken is missing", () => {
    const data: Record<string, unknown> = { webhookEnabled: true };

    const url = computeWebhookUrl(data);

    expect(url).toBeNull();
  });

  it("returns null when data is undefined", () => {
    const url = computeWebhookUrl(undefined);

    expect(url).toBeNull();
  });

  it("uses NEXT_PUBLIC_PAYLOAD_URL env var if set", () => {
    process.env.NEXT_PUBLIC_PAYLOAD_URL = "https://example.com";
    resetEnv();

    const data: Record<string, unknown> = { webhookEnabled: true, webhookToken: "my-token-value" };

    const url = computeWebhookUrl(data);

    expect(url).toBe("https://example.com/api/webhooks/trigger/my-token-value");
  });
});
