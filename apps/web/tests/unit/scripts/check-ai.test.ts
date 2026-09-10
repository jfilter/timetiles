// @vitest-environment node
/* eslint-disable boundaries/dependencies -- This regression test intentionally executes the repository-root check runner. */
/**
 * Ensure fresh reports cannot hide failed quality-check subprocesses.
 * @module
 * @category Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execSync: vi.fn(), readdirSync: vi.fn(), readFileSync: vi.fn(), exit: vi.fn() }));
vi.mock("node:child_process", () => ({ execSync: mocks.execSync }));
vi.mock("node:fs", () => ({
  default: {
    existsSync: (file: string) =>
      file.endsWith("apps/web") || file.endsWith(".lint-results") || file.endsWith(".typecheck-results"),
    readdirSync: mocks.readdirSync,
    statSync: () => ({ mtimeMs: 1 }),
    readFileSync: mocks.readFileSync,
  },
}));
vi.mock("../../../../../scripts/shared/format-utils", () => ({
  runFormatCheck: () => ({ unformatted: [] }),
  reportFormatSection: vi.fn(),
}));

describe("quality runner subprocess failures", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((code) => {
      mocks.exit(code);
      return undefined as never;
    });
    mocks.readdirSync
      .mockReturnValueOnce([])
      .mockReturnValueOnce(["fresh.json"])
      .mockReturnValueOnce([])
      .mockReturnValueOnce(["fresh.json"]);
    mocks.readFileSync.mockImplementation((file: string) =>
      JSON.stringify(file.includes(".lint-results") ? [] : { success: true, errorCount: 0 })
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it("passes when both subprocesses and reports are successful", async () => {
    await import("../../../../../scripts/check-ai");
    expect(mocks.exit).toHaveBeenCalledWith(0);
  });

  it.each(["lint", "typecheck"])("fails if %s exits unsuccessfully despite a clean fresh report", async (check) => {
    mocks.execSync.mockImplementation((command: string) => {
      if (command.includes(`${check}-fast`)) throw new Error("Subprocess failed");
    });
    await import("../../../../../scripts/check-ai");
    expect(mocks.exit).toHaveBeenCalledWith(1);
  });

  it.each(["lint", "typecheck"])("counts ordinary %s diagnostics without a duplicate runner failure", async (check) => {
    mocks.execSync.mockImplementation((command: string) => {
      if (command.includes(`${check}-fast`)) throw new Error("Diagnostics found");
    });
    mocks.readFileSync.mockImplementation((file: string) =>
      JSON.stringify(
        file.includes(".lint-results")
          ? [{ filePath: "example.ts", errorCount: check === "lint" ? 1 : 0, warningCount: 0, messages: [] }]
          : { success: check !== "typecheck", errorCount: check === "typecheck" ? 1 : 0, errors: [] }
      )
    );
    await import("../../../../../scripts/check-ai");
    expect(mocks.exit).toHaveBeenCalledWith(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("1 errors"));
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining("runner failures"));
  });
});
