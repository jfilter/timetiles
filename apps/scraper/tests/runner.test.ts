import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConcurrencyError } from "../src/lib/errors.js";
import type { RunRequest } from "../src/types.js";

// Mock logger to avoid side effects
vi.mock("../src/lib/logger.js", () => ({ logger: { info: vi.fn(), error: vi.fn() }, logError: vi.fn() }));

// Mock config
const mockConfig = {
  SCRAPER_MAX_CONCURRENT: 2,
  SCRAPER_DEFAULT_TIMEOUT: 300,
  SCRAPER_DEFAULT_MEMORY: 512,
  SCRAPER_DATA_DIR: "/tmp/timescrape-test",
  SCRAPER_MAX_OUTPUT_SIZE_MB: 100,
};

vi.mock("../src/config.js", () => ({ getConfig: vi.fn(() => mockConfig), loadConfig: vi.fn(() => mockConfig) }));

// Mock child_process.execFile
const mockExecFile = vi.fn();
vi.mock("node:child_process", () => ({ execFile: mockExecFile }));

// Mock fs/promises
const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockRm = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn();
const mockStat = vi.fn();
const mockCopyFile = vi.fn().mockResolvedValue(undefined);
vi.mock("node:fs/promises", () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  rm: (...args: unknown[]) => mockRm(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  stat: (...args: unknown[]) => mockStat(...args),
  copyFile: (...args: unknown[]) => mockCopyFile(...args),
}));

// Mock code-prep
vi.mock("../src/services/code-prep.js", () => ({ prepareCode: vi.fn().mockResolvedValue(undefined) }));

// Mock output-validator
vi.mock("../src/services/output-validator.js", () => ({ validateOutput: vi.fn().mockResolvedValue(undefined) }));

// Mock container-config
vi.mock("../src/security/container-config.js", () => ({
  buildPodmanArgs: vi.fn().mockReturnValue(["run", "--rm", "timescrape-python", "python", "/scraper/scraper.py"]),
}));

const BASE_REQUEST: RunRequest = {
  run_id: "550e8400-e29b-41d4-a716-446655440000",
  runtime: "python",
  entrypoint: "scraper.py",
  code: { "scraper.py": "print('hello')" },
};

describe("runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Re-apply default mock implementations after clear
    mockMkdir.mockResolvedValue(undefined);
    mockRm.mockResolvedValue(undefined);
    mockCopyFile.mockResolvedValue(undefined);
  });

  describe("executeRun", () => {
    it("rejects with ConcurrencyError when max concurrent runs reached", async () => {
      // Set max concurrent to 0 so any run exceeds the limit
      mockConfig.SCRAPER_MAX_CONCURRENT = 0;

      const { executeRun } = await import("../src/services/runner.js");

      await expect(executeRun(BASE_REQUEST)).rejects.toThrow(ConcurrencyError);
      await expect(executeRun(BASE_REQUEST)).rejects.toThrow("Max concurrent runs (0) reached");

      // Restore
      mockConfig.SCRAPER_MAX_CONCURRENT = 2;
    });

    it("returns success with output when execution succeeds", async () => {
      // execFile mock: successful podman run
      mockExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: Record<string, unknown>,
          cb: (err: null, result: { stdout: string; stderr: string }) => void
        ) => {
          cb(null, { stdout: "scraper output", stderr: "" });
        }
      );

      // Output file exists with valid CSV content
      const csvContent = Buffer.from("id,title\n1,Event A\n2,Event B\n");
      mockStat.mockResolvedValue({ size: csvContent.length });
      mockReadFile.mockResolvedValue(csvContent);

      const { executeRun } = await import("../src/services/runner.js");

      const result = await executeRun({ ...BASE_REQUEST, run_id: "550e8400-e29b-41d4-a716-446655440001" });

      expect(result.status).toBe("success");
      expect(result.exit_code).toBe(0);
      expect(result.output).toBeDefined();
      expect(result.output!.rows).toBe(2);
      expect(result.output!.bytes).toBe(csvContent.length);
      expect(result.output!.download_url).toBe("/output/550e8400-e29b-41d4-a716-446655440001/data.csv");
    });

    it("returns timeout status when podman is killed", async () => {
      // execFile mock: process killed (timeout)
      mockExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: Record<string, unknown>,
          cb: (err: Error & { killed: boolean }) => void
        ) => {
          const error = new Error("Process killed") as Error & { killed: boolean };
          error.killed = true;
          cb(error);
        }
      );

      const { executeRun } = await import("../src/services/runner.js");

      const result = await executeRun({ ...BASE_REQUEST, run_id: "550e8400-e29b-41d4-a716-446655440002" });

      expect(result.status).toBe("timeout");
      expect(result.exit_code).toBe(-1);
      expect(result.stderr).toContain("exceeded timeout");
    });

    it("cleans up work directory even on error", async () => {
      // execFile mock: throw a non-timeout error
      mockExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: Record<string, unknown>,
          cb: (err: Error & { killed: boolean; stdout: string; stderr: string; code: number }) => void
        ) => {
          const error = new Error("Podman crashed") as Error & {
            killed: boolean;
            stdout: string;
            stderr: string;
            code: number;
          };
          error.killed = false;
          error.stdout = "";
          error.stderr = "container error";
          error.code = 1;
          cb(error);
        }
      );

      // No output file produced
      mockStat.mockRejectedValue(new Error("ENOENT"));

      const { executeRun } = await import("../src/services/runner.js");

      const result = await executeRun({ ...BASE_REQUEST, run_id: "550e8400-e29b-41d4-a716-446655440003" });

      // The run itself returns "failed" (non-zero exit)
      expect(result.status).toBe("failed");

      // Verify cleanup was called with the work directory
      expect(mockRm).toHaveBeenCalledWith(expect.stringContaining("550e8400-e29b-41d4-a716-446655440003"), {
        recursive: true,
        force: true,
      });
    });
  });

  describe("getActiveRunCount", () => {
    it("returns 0 initially", async () => {
      const { getActiveRunCount } = await import("../src/services/runner.js");

      expect(getActiveRunCount()).toBe(0);
    });
  });

  describe("isRunActive", () => {
    it("returns false for unknown runId", async () => {
      const { isRunActive } = await import("../src/services/runner.js");

      expect(isRunActive("nonexistent-run-id")).toBe(false);
    });
  });
});
