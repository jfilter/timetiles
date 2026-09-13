// @vitest-environment node
/**
 * Feature flag cache invalidation across separately bundled copies of the service module.
 *
 * @module
 * @category Unit Tests
 */
import type { Payload } from "payload";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() } }));

const loadServiceCopy = async () => {
  vi.resetModules();
  return import("@/lib/services/feature-flag-service");
};

const payloadWithScrapers = (enabled: () => boolean) =>
  ({ findGlobal: vi.fn(() => Promise.resolve({ featureFlags: { enableScrapers: enabled() } })) }) as unknown as Payload;

describe("feature flag service shared across bundles", () => {
  afterEach(async () => {
    (await loadServiceCopy()).resetFeatureFlagService();
  });

  it("invalidates the flags a page bundle cached when the route bundle resets", async () => {
    let enabled = false;
    const payload = payloadWithScrapers(() => enabled);
    const pageBundle = await loadServiceCopy();
    const routeBundle = await loadServiceCopy();

    expect(await pageBundle.getFeatureFlagService(payload).isEnabled("enableScrapers")).toBe(false);

    enabled = true;
    routeBundle.resetFeatureFlagService();

    expect(await pageBundle.getFeatureFlagService(payload).isEnabled("enableScrapers")).toBe(true);
  });
});
