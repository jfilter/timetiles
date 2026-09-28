/**
 * Unit tests for the seed existence lookup in SeedingOperations.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { describe, expect, it, vi } from "vitest";

import { SeedingOperations } from "@/lib/seed/operations/seeding-operations";
import type { SeedManager } from "@/lib/seed/seed-manager";

describe("SeedingOperations existence lookup", () => {
  it("propagates a failed lookup instead of creating a duplicate", async () => {
    const payload = { find: vi.fn().mockRejectedValue(new Error("connection refused")), create: vi.fn() };
    const ops = new SeedingOperations({ payloadInstance: payload } as unknown as SeedManager);
    const createSingleItem = (
      ops as unknown as { createSingleItem: (...args: unknown[]) => Promise<unknown> }
    ).createSingleItem.bind(ops);

    await expect(createSingleItem({ slug: "c", name: "C" }, "catalogs", "testing", false)).rejects.toThrow(
      "connection refused"
    );
    expect(payload.create).not.toHaveBeenCalled();
  });
});
