/**
 * Unit tests for the Cache facade (key prefixing and failure policy).
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Cache } from "@/lib/services/cache/cache";
import { FileSystemCacheStorage } from "@/lib/services/cache/storage/file-system";
import { TEST_SECRETS } from "@/tests/constants/test-credentials";
import { mockLogger } from "@/tests/mocks/services/logger";

describe.sequential("Cache", () => {
  const secretKey = `https://example.com/?token=${TEST_SECRETS.payloadSecret}`;
  let tempDir: string;
  let storage: FileSystemCacheStorage;
  let cache: Cache;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cache-facade-test-"));
    storage = new FileSystemCacheStorage({ cacheDir: tempDir, maxSize: 1024 * 1024 });
    cache = new Cache(storage, "p:");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it.each([
    ["get", null, () => cache.get(secretKey)],
    ["set", undefined, () => cache.set(secretKey, "value", 60)],
    ["delete", false, () => cache.delete(secretKey)],
  ] as const)("keeps request-path %s failures secret-safe and best-effort", async (operation, fallback, run) => {
    vi.spyOn(storage, operation).mockRejectedValueOnce(new Error(secretKey));

    await expect(run()).resolves.toEqual(fallback);
    expect(mockLogger.logger.error).toHaveBeenCalledWith(`Cache ${operation} error`);
  });

  it.each([
    ["getStats", () => cache.getStats()],
    ["cleanup", () => cache.cleanup()],
  ] as const)("propagates %s failure without exposing storage details", async (operation, run) => {
    vi.spyOn(storage, operation).mockRejectedValueOnce(new Error(secretKey));

    await expect(run()).rejects.toEqual(new Error(`Cache ${operation} failed`));
  });

  it.each([0, 5])("stores under the prefixed key with a TTL of %s", async (ttl) => {
    await cache.set("a", 1, ttl);

    const entry = await storage.get("p:a");
    const { createdAt, expiresAt } = entry!.metadata;
    expect(expiresAt?.getTime()).toBe(ttl === 0 ? undefined : createdAt.getTime() + ttl * 1000);
    expect(await cache.get("a")).toBe(1);
  });
});
