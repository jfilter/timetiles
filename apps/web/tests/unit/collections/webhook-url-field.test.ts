/**
 * Unit tests for the `webhookUrl` field wiring on the two collections that expose it.
 *
 * The token lifecycle itself is covered in tests/unit/services/webhook-registry.test.ts;
 * this file checks that both field configs actually route through that shared logic.
 *
 * @module
 * @category Tests
 */
import type { Field } from "payload";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runtimeFields } from "@/lib/collections/scheduled-ingests/fields/runtime-fields";
import { scraperFields } from "@/lib/collections/scrapers/fields";
import { resetEnv } from "@/lib/config/env";

const findWebhookUrlField = (fields: Field[]): Field => {
  const field = fields.find((f) => "name" in f && f.name === "webhookUrl");
  if (!field) throw new Error("webhookUrl field not found");
  return field;
};

const CASES: Array<{ label: string; fields: Field[] }> = [
  { label: "scheduled-ingests", fields: runtimeFields },
  { label: "scrapers", fields: scraperFields },
];

describe.sequential("webhookUrl field", () => {
  const previousUrl = process.env.NEXT_PUBLIC_PAYLOAD_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_PAYLOAD_URL = "https://example.com";
    resetEnv();
  });

  afterEach(() => {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_PAYLOAD_URL;
    else process.env.NEXT_PUBLIC_PAYLOAD_URL = previousUrl;
    resetEnv();
  });

  describe.each(CASES)("$label", ({ fields }) => {
    const field = findWebhookUrlField(fields);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Payload field hook/admin shapes are loosely typed here
    const anyField = field as any;

    it("is visible only while the one-shot plaintext is available", () => {
      const condition = anyField.admin.condition as (data: Record<string, unknown>) => boolean;

      expect(condition({ webhookEnabled: true, webhookTokenPlaintext: "plain" })).toBe(true);
      // The stored hash must NOT reveal the field — the plaintext is shown once.
      expect(condition({ webhookEnabled: true, webhookToken: "hash" })).toBe(false);
      expect(condition({ webhookEnabled: false, webhookTokenPlaintext: "plain" })).toBe(false);
    });

    it("builds the trigger URL from the plaintext token", () => {
      const afterRead = anyField.hooks.afterRead[0] as (args: { data?: Record<string, unknown> }) => string | null;

      expect(afterRead({ data: { webhookEnabled: true, webhookTokenPlaintext: "tok" } })).toBe(
        "https://example.com/api/webhooks/trigger/tok"
      );
      expect(afterRead({ data: { webhookEnabled: true, webhookToken: "hash" } })).toBeNull();
      expect(afterRead({ data: { webhookEnabled: false, webhookTokenPlaintext: "tok" } })).toBeNull();
    });
  });
});
