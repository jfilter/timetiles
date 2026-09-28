// @vitest-environment node
/**
 * Ensure fresh reports cannot hide failed quality-check subprocesses.
 * @module
 * @category Tests
 */
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as FormatUtils from "../../../../../scripts/shared/format-utils";
import { parseTscOutput } from "../../../../../scripts/shared/typecheck-utils";

const mocks = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  spawnSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  runFormatCheck: vi.fn(),
  exit: vi.fn(),
}));
vi.mock("node:child_process", () => ({ execFileSync: mocks.execFileSync, spawnSync: mocks.spawnSync }));
vi.mock("node:fs", () => ({
  default: {
    existsSync: mocks.existsSync,
    readdirSync: mocks.readdirSync,
    statSync: () => ({ mtimeMs: 1 }),
    readFileSync: mocks.readFileSync,
  },
}));
vi.mock("../../../../../scripts/shared/format-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof FormatUtils>()),
  runFormatCheck: mocks.runFormatCheck,
  reportFormatSection: vi.fn(),
}));

const runCheckAi = async (...args: string[]) => {
  vi.spyOn(process, "argv", "get").mockReturnValue(["node", "check-ai.ts", ...args]);
  await import("../../../../../scripts/check-ai");
};

describe("quality runner subprocess failures", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.runFormatCheck.mockReturnValue({ unformatted: [] });
    mocks.existsSync.mockImplementation(
      (file: string) =>
        file.endsWith("apps/web") || file.endsWith(".lint-results") || file.endsWith(".typecheck-results")
    );
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
    await runCheckAi();
    expect(mocks.exit).toHaveBeenCalledWith(0);
    expect(mocks.execFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/\/node_modules\/\.bin\/tsx$/),
      [expect.stringContaining("/scripts/typecheck-with-json.ts")],
      expect.objectContaining({ stdio: "pipe" })
    );
  });

  it.each(["shared", "scraper"])("runs lint and typecheck for packages/%s", async (pkg) => {
    mocks.existsSync.mockImplementation(
      (file: string) =>
        file.endsWith(`packages/${pkg}`) || file.endsWith(".lint-results") || file.endsWith(".typecheck-results")
    );
    await runCheckAi();
    for (const script of ["lint-fast-with-json.ts", "typecheck-with-json.ts"]) {
      expect(mocks.execFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/\/node_modules\/\.bin\/tsx$/),
        [expect.stringContaining(`/scripts/${script}`)],
        expect.objectContaining({ cwd: resolve(process.cwd(), "packages", pkg) })
      );
    }
    expect(mocks.exit).toHaveBeenCalledWith(0);
  });

  it.each(["lint", "typecheck"])("fails if %s exits unsuccessfully despite a clean fresh report", async (check) => {
    mocks.execFileSync.mockImplementation((_command: string, args: string[]) => {
      if (args[0]?.includes(`${check}-`)) throw new Error("Subprocess failed");
    });
    await runCheckAi();
    expect(mocks.exit).toHaveBeenCalledWith(1);
  });

  it.each(["lint", "typecheck"])("counts ordinary %s diagnostics without a duplicate runner failure", async (check) => {
    mocks.execFileSync.mockImplementation((_command: string, args: string[]) => {
      if (args[0]?.includes(`${check}-`)) throw new Error("Diagnostics found");
    });
    mocks.readFileSync.mockImplementation((file: string) =>
      JSON.stringify(
        file.includes(".lint-results")
          ? [{ filePath: "example.ts", errorCount: check === "lint" ? 1 : 0, warningCount: 0, messages: [] }]
          : { success: check !== "typecheck", errorCount: check === "typecheck" ? 1 : 0, errors: [] }
      )
    );
    await runCheckAi();
    expect(mocks.exit).toHaveBeenCalledWith(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("1 errors"));
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining("runner failures"));
  });

  it("counts a crashed format check as a runner failure in the headline", async () => {
    mocks.runFormatCheck.mockReturnValue({ unformatted: [], toolError: "oxfmt could not be started" });
    await runCheckAi();
    expect(mocks.exit).toHaveBeenCalledWith(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("0 errors, 0 warnings, 1 runner failures"));
  });
});

describe("format-only check", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((code) => {
      mocks.exit(code);
      return undefined as never;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([
    { result: { unformatted: [] }, expected: 0 },
    { result: { unformatted: ["a.ts"] }, expected: 1 },
    { result: { unformatted: [], toolError: "oxfmt exited 2" }, expected: 1 },
  ])("exits $expected for $result", async ({ result, expected }) => {
    mocks.runFormatCheck.mockReturnValue(result);
    await runCheckAi("--format", "apps/web");
    expect(mocks.runFormatCheck).toHaveBeenCalledWith(["apps/web"], process.cwd());
    expect(mocks.execFileSync).not.toHaveBeenCalled();
    expect(mocks.exit).toHaveBeenCalledWith(expected);
  });
});

describe("tsc diagnostic parsing", () => {
  const output = [
    "app/(frontend)/page.tsx(12,5): error TS2322: Type 'string' is not assignable to type 'number'.",
    "  Type detail",
    "lib/x.ts(1,1): warning TS6133: 'a' is declared but never used.",
  ].join("\n");

  it("keeps parentheses in file paths and joins continuation lines", () => {
    expect(parseTscOutput(output)).toEqual([
      {
        file: "app/(frontend)/page.tsx",
        line: 12,
        column: 5,
        code: "TS2322",
        message: "Type 'string' is not assignable to type 'number'. Type detail",
        severity: "error",
      },
      {
        file: "lib/x.ts",
        line: 1,
        column: 1,
        code: "TS6133",
        message: "'a' is declared but never used.",
        severity: "warning",
      },
    ]);
    expect(parseTscOutput(output, "raw")[0]?.message).toBe(
      "Type 'string' is not assignable to type 'number'.\n  Type detail"
    );
  });

  it("parses nothing from diagnostics without a file location", () => {
    expect(parseTscOutput("error TS2688: Cannot find type definition file for 'node'.")).toEqual([]);
  });
});

describe("oxfmt output parsing", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lists the files oxfmt reports and ignores its summary line", async () => {
    const { runFormatCheck } = await vi.importActual<typeof FormatUtils>("../../../../../scripts/shared/format-utils");
    mocks.spawnSync.mockReturnValue({
      status: 1,
      stdout: "apps/web/app/(frontend)/page.tsx (8ms)\nFinished in 37ms on 2 files using 10 threads.",
      stderr: "",
    });
    expect(runFormatCheck(["apps/web"], "/repo")).toEqual({ unformatted: ["apps/web/app/(frontend)/page.tsx"] });
    expect(mocks.spawnSync).toHaveBeenCalledWith(
      expect.stringMatching(/\/node_modules\/\.bin\/oxfmt$/),
      ["--check", "apps/web"],
      expect.objectContaining({ cwd: "/repo" })
    );
  });
});
