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
 * Handles multi-line error messages by joining continuation lines:
 * "space" collapses them into one trimmed line, "raw" keeps the original
 * newlines and indentation (used by check-summary's detailed report).
 */
const DIAGNOSTIC_LOCATION = /\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+/;

/** One `file(line,col): error TSxxxx: message` line, or null for any other line. */
const parseDiagnosticLine = (line: string): TypeScriptError | null => {
  const match = DIAGNOSTIC_LOCATION.exec(line);
  if (!match?.[1] || !match[2] || !match[3] || !match[4]) return null;
  const file = line.slice(0, match.index);
  const message = line.slice(match.index + match[0].length);
  if (file === "" || message === "") return null;
  return {
    file,
    line: Number.parseInt(match[1], 10),
    column: Number.parseInt(match[2], 10),
    code: match[4],
    message,
    severity: match[3] as "error" | "warning",
  };
};

export const parseTscOutput = (output: string, continuation: "space" | "raw" = "space"): TypeScriptError[] => {
  const lines = output.split("\n");
  const errors: TypeScriptError[] = [];
  let currentError: TypeScriptError | null = null;

  lines.forEach((line) => {
    const diagnostic = parseDiagnosticLine(line);
    if (diagnostic) {
      if (currentError) {
        errors.push(currentError);
      }
      currentError = diagnostic;
    } else if (currentError && line.trim() && !/^\s*$/.test(line)) {
      currentError.message += continuation === "raw" ? "\n" + line : " " + line.trim();
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
