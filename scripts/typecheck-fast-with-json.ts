#!/usr/bin/env tsx
/**
 * Wrapper to run tsgo (TypeScript 7) and generate JSON results for check-ai.
 *
 * @module
 * @category Scripts
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

interface TypeScriptError {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
  severity: "error" | "warning";
}

try {
  const output = execSync("pnpm exec tsgo --noEmit --pretty false 2>&1", {
    encoding: "utf-8",
  });

  // No errors
  fs.writeFileSync(
    ".typecheck-results.json",
    JSON.stringify({ success: true, errorCount: 0, errors: [], timestamp: new Date().toISOString() }, null, 2)
  );
} catch (error) {
  const errorWithOutput = error as { stdout?: string | Buffer; stderr?: string | Buffer };
  const stdout = errorWithOutput.stdout?.toString() ?? "";
  const stderr = errorWithOutput.stderr?.toString() ?? "";
  const output = stdout + "\n" + stderr;
  const lines = output.split("\n");

  // Parse errors (same format as tsc)
  // eslint-disable-next-line sonarjs/slow-regex, regexp/no-super-linear-backtracking
  const diagnosticPattern = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.*)$/;
  const errors: TypeScriptError[] = [];
  let currentError: TypeScriptError | null = null;

  lines.forEach((line) => {
    const match = diagnosticPattern.exec(line);
    if (match?.[1] && match[2] && match[3] && match[4] && match[5] && match[6]) {
      // Save previous error if exists
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
      // Continuation of multi-line message
      currentError.message += " " + line.trim();
    }
  });

  // Don't forget the last error
  if (currentError) {
    errors.push(currentError);
  }

  const errorCount = errors.filter((e) => e.severity === "error").length;
  const success = errorCount === 0;

  fs.writeFileSync(
    ".typecheck-results.json",
    JSON.stringify({ success, errorCount, errors, timestamp: new Date().toISOString() }, null, 2)
  );

  if (!success) {
    process.exit(1);
  }
}
