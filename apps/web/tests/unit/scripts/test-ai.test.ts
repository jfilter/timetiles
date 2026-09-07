// @vitest-environment node
/**
 * Verify that the AI test wrapper cannot turn a failed Vitest run green.
 *
 * @module
 * @category Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execSync: vi.fn(), readFileSync: vi.fn(), writeFileSync: vi.fn(), exit: vi.fn() }));

vi.mock("node:child_process", () => ({ execSync: mocks.execSync }));
vi.mock("node:fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    existsSync: vi.fn(() => true),
    readFileSync: mocks.readFileSync,
    writeFileSync: mocks.writeFileSync,
    readdirSync: vi.fn(() => []),
    unlinkSync: vi.fn(),
  },
}));

describe.sequential("AI test runner exit status", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((code) => {
      mocks.exit(code);
      return undefined as never;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    { success: true, childFailed: false, expected: 0 },
    { success: false, childFailed: false, expected: 1 },
    { success: true, childFailed: true, expected: 1 },
  ])(
    "returns $expected for report=$success, child failure=$childFailed",
    async ({ success, childFailed, expected }) => {
      mocks.readFileSync.mockReturnValue(
        JSON.stringify({
          success,
          numTotalTests: 1,
          numPassedTests: 1,
          numFailedTests: 0,
          testResults: [{ name: "example.test.ts", status: "passed", assertionResults: [] }],
        })
      );
      if (childFailed)
        mocks.execSync.mockImplementation(() => {
          throw new Error("Vitest exited with an error");
        });

      await import("@/scripts/test-ai");

      expect(mocks.exit).toHaveBeenCalledWith(expected);
      const report = JSON.parse(mocks.writeFileSync.mock.calls[0]![1] as string) as { success: boolean };
      expect(report.success).toBe(expected === 0);
    }
  );
});
