/**
 * Unit tests for seed manager cleanup behavior.
 *
 * @module
 * @category Unit Tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockBuildConfigWithDefaults = vi.hoisted(() => vi.fn());
const mockGetPayload = vi.hoisted(() => vi.fn());

vi.mock("@/lib/config/payload-config-factory", () => ({ buildConfigWithDefaults: mockBuildConfigWithDefaults }));

vi.mock("@/lib/logger", () => ({ createLogger: () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

vi.mock("payload", () => ({ getPayload: mockGetPayload }));

import { SeedManagerBase } from "@/lib/seed/core/seed-manager-base";

class TestSeedManager extends SeedManagerBase {
  setPayload(payload: unknown): void {
    this.payload = payload as typeof this.payload;
  }
}

describe("SeedManagerBase cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers payload.db.destroy over closing the raw pool directly", async () => {
    const manager = new TestSeedManager();
    const destroy = vi.fn().mockResolvedValue(undefined);
    const end = vi.fn().mockResolvedValue(undefined);
    const drizzleEnd = vi.fn();

    manager.setPayload({ db: { destroy, pool: { end, ended: false }, drizzle: { end: drizzleEnd } } });

    await manager.cleanup();

    expect(destroy).toHaveBeenCalledOnce();
    expect(end).not.toHaveBeenCalled();
    expect(drizzleEnd).not.toHaveBeenCalled();
    expect(manager.payloadInstance).toBeNull();
  });

  it("falls back to pool and drizzle cleanup when destroy is unavailable", async () => {
    const manager = new TestSeedManager();
    const end = vi.fn().mockResolvedValue(undefined);
    const drizzleEnd = vi.fn();

    manager.setPayload({ db: { pool: { end, ended: false }, drizzle: { end: drizzleEnd } } });

    await manager.cleanup();

    expect(end).toHaveBeenCalledOnce();
    expect(drizzleEnd).toHaveBeenCalledOnce();
    expect(manager.payloadInstance).toBeNull();
  });

  it("falls back to pool and drizzle cleanup when destroy fails", async () => {
    const manager = new TestSeedManager();
    const destroy = vi.fn().mockRejectedValue(new Error("destroy failed"));
    const end = vi.fn().mockResolvedValue(undefined);
    const drizzleEnd = vi.fn();

    manager.setPayload({ db: { destroy, pool: { end, ended: false }, drizzle: { end: drizzleEnd } } });

    await manager.cleanup();

    expect(destroy).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledOnce();
    expect(drizzleEnd).toHaveBeenCalledOnce();
    expect(manager.payloadInstance).toBeNull();
  });
});
