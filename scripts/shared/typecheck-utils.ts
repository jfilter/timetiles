/**
 * Shared utilities for typecheck and lint scripts.
 *
 * Extracts common patterns: TypeScript error parsing, result file pruning,
 * and timestamped output path generation.
 *
 * @module
 * @category Scripts
 */
import fs from "node:fs";
import path from "node:path";

export interface TypeScriptError {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
  severity: "error" | "warning";
}

/**
 * Parse tsc/tsgo output into structured TypeScript errors.
 * Handles multi-line error messages by joining continuation lines.
 */
export const parseTscOutput = (output: string): TypeScriptError[] => {
  const lines = output.split("\n");
  // eslint-disable-next-line sonarjs/slow-regex, regexp/no-super-linear-backtracking
  const diagnosticPattern = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.*)$/;
  const errors: TypeScriptError[] = [];
  let currentError: TypeScriptError | null = null;

  lines.forEach((line) => {
    const match = diagnosticPattern.exec(line);
    if (match?.[1] && match[2] && match[3] && match[4] && match[5] && match[6]) {
      if (currentError) {
        errors.push(currentError);
      }

      const severity = match[4] as "error" | "warning";
      currentError = {
        file: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        code: match[5],
        message: match[6],
        severity,
      };
    } else if (currentError && line.trim() && !/^\s*$/.test(line)) {
      currentError.message += " " + line.trim();
    }
  });

  if (currentError) {
    errors.push(currentError);
  }

  return errors;
};

/**
 * Prune old JSON result files in a directory, keeping the most recent ones.
 */
export const pruneOldResults = (dir: string, keep = 50): void => {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));
  for (const file of files.slice(0, -keep)) {
    fs.unlinkSync(path.join(dir, file));
  }
};

/**
 * Create a filesystem-safe timestamp string for result file names.
 */
export const createTimestamp = (): string =>
  new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\.\d+Z$/, "");
