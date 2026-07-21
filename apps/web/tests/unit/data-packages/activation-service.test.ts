/**
 * Unit tests for data-package activation helpers.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { describe, expect, it, vi } from "vitest";

import { buildActivationKey, deactivateDataPackage } from "@/lib/data-packages/activation-service";
import type { User } from "@/payload-types";

describe("buildActivationKey", () => {
  it("returns the bare slug when there are no parameters", () => {
    expect(buildActivationKey("berlin-events", {})).toBe("berlin-events");
  });

  it("produces the same key regardless of parameter insertion order", () => {
    const a = buildActivationKey("pkg", { year: "2026", city: "berlin" });
    const b = buildActivationKey("pkg", { city: "berlin", year: "2026" });
    expect(a).toBe(b);
  });

  it("sorts parameters locale-independently so the uniqueness key is stable across environments", () => {
    // Regression: parameters were sorted with String.prototype.localeCompare,
    // whose ordering depends on the runtime locale/ICU. This key is persisted as
    // `dataPackageSlug` and compared to reject duplicate activations, so a
    // locale-dependent ordering could let a duplicate slip through. Ordering must
    // not depend on localeCompare.
    const params = { city: "berlin", year: "2026", _region: "eu" };
    const expected = buildActivationKey("pkg", params);

    const spy = vi.spyOn(String.prototype, "localeCompare").mockImplementation(function (
      this: string,
      that: string
    ): number {
      if (this < that) return 1;
      if (this > that) return -1;
      return 0;
    });
    try {
      expect(buildActivationKey("pkg", params)).toBe(expected);
    } finally {
      spy.mockRestore();
    }
  });
});

describe.sequential("deactivateDataPackage", () => {
  const OWNER_ID = 7;
  const owner = { id: OWNER_ID, role: "user" } as User;

  const activation = (id: number, key: string, createdBy = OWNER_ID) => ({ id, dataPackageSlug: key, createdBy });

  const payloadWith = (docs: unknown[]) =>
    ({ find: vi.fn().mockResolvedValue({ docs }), update: vi.fn().mockResolvedValue({}) }) as never;

  it("disables EVERY activation of a parameterized package, not just one", async () => {
    // The deactivate route never forwards `parameters`, so the multi-match
    // branch is always taken. Acting on a single arbitrary document left the
    // other activations live with no way to reach them through the UI.
    const payload = payloadWith([
      activation(1, "berlin-events:year=2024"),
      activation(2, "berlin-events:year=2025"),
      activation(3, "berlin-events:year=2026"),
    ]);

    await deactivateDataPackage(payload, "berlin-events", owner);

    const update = (payload as unknown as { update: ReturnType<typeof vi.fn> }).update;
    expect(update).toHaveBeenCalledTimes(3);
    expect(update.mock.calls.map((call) => (call[0] as { id: number }).id)).toEqual([1, 2, 3]);
    for (const call of update.mock.calls) {
      expect((call[0] as { data: unknown }).data).toEqual({ enabled: false });
    }
  });

  it("ignores foreign keys that merely contain the slug (Payload `like` is a contains match)", async () => {
    const payload = payloadWith([
      activation(1, "city-demo:year=2026"), // contains "demo:" but is a different package
      activation(2, "demo"),
    ]);

    await deactivateDataPackage(payload, "demo", owner);

    const update = (payload as unknown as { update: ReturnType<typeof vi.fn> }).update;
    expect(update).toHaveBeenCalledTimes(1);
    expect((update.mock.calls[0]![0] as { id: number }).id).toBe(2);
  });

  it("deactivates only the activations the caller owns", async () => {
    const payload = payloadWith([
      activation(1, "pkg:a=1", OWNER_ID),
      activation(2, "pkg:a=2", 999),
      activation(3, "pkg:a=3", OWNER_ID),
    ]);

    await deactivateDataPackage(payload, "pkg", owner);

    const update = (payload as unknown as { update: ReturnType<typeof vi.fn> }).update;
    expect(update.mock.calls.map((call) => (call[0] as { id: number }).id)).toEqual([1, 3]);
  });

  it("rejects when the caller owns none of the matches", async () => {
    const payload = payloadWith([activation(1, "pkg:a=1", 999), activation(2, "pkg:a=2", 999)]);

    await expect(deactivateDataPackage(payload, "pkg", owner)).rejects.toThrow(
      "You can only deactivate data packages you activated"
    );
    expect((payload as unknown as { update: ReturnType<typeof vi.fn> }).update).not.toHaveBeenCalled();
  });

  it("lets an admin deactivate every activation regardless of owner", async () => {
    const payload = payloadWith([activation(1, "pkg:a=1", 999), activation(2, "pkg:a=2", 111)]);

    await deactivateDataPackage(payload, "pkg", { id: 1, role: "admin" } as User);

    expect((payload as unknown as { update: ReturnType<typeof vi.fn> }).update).toHaveBeenCalledTimes(2);
  });

  it("throws when the package is not activated at all", async () => {
    const payload = payloadWith([]);

    await expect(deactivateDataPackage(payload, "pkg", owner)).rejects.toThrow('Data package "pkg" is not activated');
  });
});
