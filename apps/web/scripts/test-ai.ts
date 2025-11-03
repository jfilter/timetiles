#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * AI-friendly test runner with summary output.
 *
 * Runs vitest with JSON output and displays a concise summary.
 * Accepts file filters as command-line arguments for faster test iteration.
 *
 * Usage:
 *   tsx scripts/test-ai.ts                    # Run all tests
 *   tsx scripts/test-ai.ts date.test          # Run tests matching pattern (FASTEST)
 *   tsx scripts/test-ai.ts store.test         # Run store.test.ts only
 *   tsx scripts/test-ai.ts tests/unit/lib     # Run tests in directory
 *   tsx scripts/test-ai.ts tests/unit         # Run all unit tests
 *
 * Via Makefile (recommended):
 *   make test-ai                              # Run all tests
 *   make test-ai FILTER=date.test             # Run specific test
 *   make test-ai FILTER=tests/unit/lib        # Run directory
 *
 * Via pnpm:
 *   pnpm test:ai                              # Run all tests
 *   pnpm test:ai date.test                    # Run specific test
 *
 * Performance: Pattern filters are 24-120x faster than running all tests.
 *
 * @module
 * @category Scripts
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

interface TestResult {
  name: string;
  status: string;
  duration?: number;
  assertionResults: Array<{
    status: string;
    title: string;
    failureMessages?: string[];
  }>;
}

interface TestSummary {
  success: boolean;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numSkippedTests?: number;
  numPendingTests?: number;
  duration?: number;
  testResults: TestResult[];
}

// Get filter arguments (everything after script name, excluding flags and --)
const filters = process.argv.slice(2).filter((arg) => !arg.startsWith("-") && arg !== "--");
const filterArg = filters.length > 0 ? filters.join(" ") : "";

// Build vitest command
// Note: Filter must come AFTER 'vitest run' but BEFORE reporter flags
const vitestCmd = [
  'NODE_OPTIONS="--no-warnings"',
  "DOTENV_CONFIG_SILENT=true",
  "pnpm exec vitest",
  "run",
  filterArg, // Filter goes here, after 'run' but before flags
  "--reporter=json",
  "--outputFile.json=.test-results.json",
  "--silent",
  "2>/dev/null",
]
  .filter(Boolean)
  .join(" ");

// Run vitest
try {
  execSync(vitestCmd, {
    stdio: "pipe",
    cwd: process.cwd(),
    shell: "/bin/bash", // Required for shell operators like 2>/dev/null
  });
} catch {
  // Vitest exits non-zero on test failures, that's expected
  // We'll check the results JSON for actual status
}

// Read and display summary
const resultsPath = path.join(process.cwd(), ".test-results.json");

try {
  const results = JSON.parse(fs.readFileSync(resultsPath, "utf-8")) as TestSummary;

  const duration = results.duration ?? results.testResults?.reduce((sum, t) => sum + (t.duration ?? 0), 0) ?? 0;
  const status = results.success ? "✅" : "❌";
  const skipped = results.numSkippedTests ?? results.numPendingTests ?? 0;

  // Single line summary
  const skippedStr = skipped > 0 ? `, ${skipped} skipped` : "";
  const durationStr = duration > 0 ? ` (${(duration / 1000).toFixed(1)}s)` : "";
  console.log(
    `${status} ${results.numPassedTests} passed, ${results.numFailedTests} failed${skippedStr}${durationStr}`
  );

  // List failed test files if any
  if (results.numFailedTests > 0) {
    const failedFiles = results.testResults
      .filter((suite) => suite.status === "failed")
      .map((suite) => suite.name)
      .join(", ");
    console.log(`Failed: ${failedFiles}`);
  }

  // JSON location
  console.log("→ .test-results.json");

  // Exit with appropriate code
  process.exit(results.success ? 0 : 1);
} catch {
  console.error("❌ Could not read .test-results.json");
  process.exit(1);
}
