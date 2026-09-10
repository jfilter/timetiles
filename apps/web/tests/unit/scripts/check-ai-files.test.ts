// @vitest-environment node
/* eslint-disable boundaries/dependencies -- Tests the repository-root file-scoped check directly. */
/**
 * File filtering must not hide checking-tool failures.
 * @module
 * @category Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ spawnSync: vi.fn(), exit: vi.fn() }));
vi.mock("node:child_process", () => ({ spawnSync: mocks.spawnSync }));
vi.mock("node:fs", () => ({ default: { existsSync: () => true } }));
vi.mock("../../../../../scripts/shared/format-utils", () => ({
  runFormatCheck: () => ({ unformatted: [] }),
  reportFormatSection: vi.fn(),
}));

describe("file-scoped check", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.spyOn(process, "argv", "get").mockReturnValue(["node", "check-ai-files.ts", "apps/web", "selected.ts"]);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((code) => {
      mocks.exit(code);
      return undefined as never;
    });
    mocks.spawnSync.mockReturnValue({ status: 0, stdout: "", stderr: "" });
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([0, 1, null])("preserves oxlint status %s with empty diagnostics", async (status) => {
    mocks.spawnSync.mockReturnValueOnce({
      status,
      signal: status === null ? "SIGTERM" : null,
      stdout: JSON.stringify({ diagnostics: [], number_of_files: 1 }),
      stderr: "",
    });
    await import("../../../../../scripts/check-ai-files");
    expect(mocks.exit).toHaveBeenCalledWith(status === 0 ? 0 : 1);
  });

  it.each([
    { output: "selected.ts(1,2): error TS2322: Wrong type", expected: 1 },
    { output: "other.ts(1,2): error TS2322: Wrong type", expected: 0 },
    { output: "Typechecker crashed", expected: 1 },
  ])("handles typecheck output: $output", async ({ output, expected }) => {
    mocks.spawnSync
      .mockReturnValueOnce({ status: 0, stdout: JSON.stringify({ diagnostics: [], number_of_files: 1 }) })
      .mockReturnValueOnce({ status: 1, stdout: output, stderr: "" });
    await import("../../../../../scripts/check-ai-files");
    expect(mocks.exit).toHaveBeenCalledWith(expected);
  });
});
