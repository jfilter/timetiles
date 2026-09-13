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
  existsSync: vi.fn(() => true),
  readdirSync: vi.fn(() => [] as string[]),
  exit: vi.fn(),
}));

vi.mock("node:child_process", () => ({ execFileSync: mocks.execFileSync }));
vi.mock("node:fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    existsSync: mocks.existsSync,
    readFileSync: mocks.readFileSync,
    writeFileSync: mocks.writeFileSync,
    readdirSync: mocks.readdirSync,
    statSync: vi.fn(() => ({ mtimeMs: Date.now() + 1000 })),
    unlinkSync: vi.fn(),
  },
}));

const PNPM_ENTRY = "/opt/pnpm/bin/pnpm.cjs";

describe.sequential("AI test runner exit status", () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    process.argv = ["node", "test-ai.ts"];
    vi.stubEnv("npm_execpath", PNPM_ENTRY);
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
    vi.unstubAllEnvs();
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

  it("reports suite failures even when no test assertion failed", async () => {
    mocks.readFileSync.mockReturnValue(
      JSON.stringify({
        success: false,
        numPassedTests: 0,
        numFailedTests: 0,
        numPendingTests: 19,
        testResults: [
          { name: "setup.test.ts", status: "failed", message: "Hook timed out in 45000ms.", assertionResults: [] },
        ],
      })
    );
    await import("@/scripts/test-ai");
    expect(mocks.exit).toHaveBeenCalledWith(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("19 skipped, failed suites: 1"));
    expect(console.log).toHaveBeenCalledWith("setup.test.ts: Hook timed out in 45000ms.");
  });

  it("passes filters as literal arguments without invoking a shell", async () => {
    process.argv.push("(date|store)", "geo jobs", "tests/[locale]/name;literal.test.ts");
    mocks.readFileSync.mockReturnValue(
      JSON.stringify({ success: true, numTotalTests: 0, numPassedTests: 0, numFailedTests: 0, testResults: [] })
    );

    await import("@/scripts/test-ai");

    expect(mocks.execFileSync).toHaveBeenCalledWith(
      process.execPath,
      [
        PNPM_ENTRY,
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
        stdio: ["ignore", "ignore", "inherit"],
        cwd: process.cwd(),
        env: { ...process.env, NODE_OPTIONS: "--no-warnings", DOTENV_CONFIG_SILENT: "true" },
      }
    );
  });

  it("fails without spawning when it was not started through a pnpm script", async () => {
    vi.stubEnv("npm_execpath", "");
    mocks.readFileSync.mockImplementation(() => {
      throw new Error("Report does not exist");
    });

    await import("@/scripts/test-ai");

    expect(mocks.execFileSync).not.toHaveBeenCalled();
    expect(mocks.exit).toHaveBeenCalledWith(1);
  });

  it("fails when its own report is missing even if another run wrote a passing report", async () => {
    mocks.existsSync.mockReturnValue(false);
    mocks.readdirSync.mockReturnValue(["other-run.json"]);
    mocks.readFileSync.mockImplementation((file: string) => {
      if (file.endsWith("other-run.json")) {
        return JSON.stringify({
          success: true,
          numTotalTests: 1,
          numPassedTests: 1,
          numFailedTests: 0,
          testResults: [],
        });
      }
      throw new Error("Report does not exist");
    });

    await import("@/scripts/test-ai");

    expect(mocks.exit).toHaveBeenCalledWith(1);
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });

  it("keeps process diagnostics visible when a crash leaves no report", async () => {
    mocks.execFileSync.mockImplementation(() => {
      throw Object.assign(new Error("Worker terminated"), { signal: "SIGABRT", status: null });
    });
    mocks.readFileSync.mockImplementation(() => {
      throw new Error("Report does not exist");
    });

    await import("@/scripts/test-ai");

    expect(mocks.execFileSync).toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining([PNPM_ENTRY]),
      expect.objectContaining({ stdio: ["ignore", "ignore", "inherit"] })
    );
    expect(mocks.exit).toHaveBeenCalledWith(1);
    expect(mocks.writeFileSync).not.toHaveBeenCalled();
  });
});
