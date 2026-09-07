// @vitest-environment node
/**
 * Verify that the AI test wrapper cannot turn a failed Vitest run green.
 *
 * @module
 * @category Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  exit: vi.fn(),
}));

vi.mock("node:child_process", () => ({ execFileSync: mocks.execFileSync }));
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
  const originalArgv = process.argv;

  beforeEach(() => {
    process.argv = ["node", "test-ai.ts"];
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
    process.argv = originalArgv;
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
        mocks.execFileSync.mockImplementation(() => {
          throw new Error("Vitest exited with an error");
        });

      await import("@/scripts/test-ai");

      expect(mocks.exit).toHaveBeenCalledWith(expected);
      const report = JSON.parse(mocks.writeFileSync.mock.calls[0]![1] as string) as { success: boolean };
      expect(report.success).toBe(expected === 0);
    }
  );

  it("passes filters as literal arguments without invoking a shell", async () => {
    process.argv.push("(date|store)", "geo jobs", "tests/[locale]/name;literal.test.ts");
    mocks.readFileSync.mockReturnValue(
      JSON.stringify({ success: true, numTotalTests: 0, numPassedTests: 0, numFailedTests: 0, testResults: [] })
    );

    await import("@/scripts/test-ai");

    expect(mocks.execFileSync).toHaveBeenCalledWith(
      "pnpm",
      [
        "exec",
        "vitest",
        "run",
        "date",
        "store",
        "geo",
        "jobs",
        "tests/[locale]/name;literal.test.ts",
        "--reporter=json",
        expect.stringContaining("--outputFile.json="),
        "--silent",
      ],
      {
        stdio: "pipe",
        cwd: process.cwd(),
        env: { ...process.env, NODE_OPTIONS: "--no-warnings", DOTENV_CONFIG_SILENT: "true" },
      }
    );
  });
});
