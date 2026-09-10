// @vitest-environment node
/* eslint-disable boundaries/dependencies -- Tests the repository-root lint wrapper directly. */
/**
 * Preserve failed oxlint exit status even with valid empty diagnostics.
 * @module
 * @category Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execSync: vi.fn(), writeFileSync: vi.fn(), exit: vi.fn() }));
vi.mock("node:child_process", () => ({ execSync: mocks.execSync }));
vi.mock("node:fs", () => ({ default: { mkdirSync: vi.fn(), writeFileSync: mocks.writeFileSync } }));
vi.mock("../../../../../scripts/shared/typecheck-utils", () => ({
  createTimestamp: () => "test-run",
  pruneOldResults: vi.fn(),
}));

describe("oxlint wrapper exit status", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.spyOn(process, "exit").mockImplementation((code) => {
      mocks.exit(code);
      return undefined as never;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([false, true])("preserves process failure=%s with empty diagnostics", async (failed) => {
    const output = JSON.stringify({ diagnostics: [] });
    mocks.execSync.mockImplementation(() => {
      if (failed) throw Object.assign(new Error("oxlint failed"), { stdout: output, status: 1 });
      return output;
    });
    await import("../../../../../scripts/lint-fast-with-json");
    expect(mocks.exit).toHaveBeenCalledWith(failed ? 1 : 0);
    expect(mocks.writeFileSync).toHaveBeenCalledWith(expect.stringContaining("test-run.json"), "[]");
  });
});
