/**
 * Unit test for the seeded privacy policy quoting the configured grace period.
 *
 * The deletion service schedules against
 * `getAppConfig().account.deletionGracePeriodDays`, so the published privacy
 * policy must quote the same number rather than the client-side display
 * default — otherwise an operator who shortens the grace period ships a policy
 * that contradicts what the software does.
 *
 * @module
 * @category Unit Tests
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const CONFIGURED_GRACE_PERIOD_DAYS = 7;

const collectText = (value: unknown, out: string[]): void => {
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, out);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const node = value as Record<string, unknown>;
  if (typeof node.text === "string") out.push(node.text);
  for (const entry of Object.values(node)) collectText(entry, out);
};

describe("seeded privacy policy", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("quotes the configured deletion grace period in both locales", async () => {
    vi.doMock("@/lib/config/app-config", () => ({
      getAppConfig: () => ({ account: { deletionGracePeriodDays: CONFIGURED_GRACE_PERIOD_DAYS } }),
    }));

    const { pagesSeed, pagesSeedDe } = await import("@/lib/seed/seeds/pages");

    const english: string[] = [];
    collectText(
      pagesSeed.find((page) => page.slug === "privacy"),
      english
    );
    const german: string[] = [];
    collectText(pagesSeedDe.privacy, german);

    expect(english.join(" ")).toContain(`${CONFIGURED_GRACE_PERIOD_DAYS}-day grace period`);
    expect(german.join(" ")).toContain(`${CONFIGURED_GRACE_PERIOD_DAYS}-tägigen Frist`);
    expect(english.join(" ")).not.toContain("30-day grace period");
    expect(german.join(" ")).not.toContain("30-tägigen Frist");
  });
});
