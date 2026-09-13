#!/usr/bin/env tsx
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
 *   tsx scripts/test-ai.ts date store         # Run multiple patterns (space-separated)
 *   tsx scripts/test-ai.ts "date|store|geo"   # Run multiple patterns (pipe-separated)
 *
 * Via Makefile (recommended):
 *   make test-ai                              # Run all tests
 *   make test-ai FILTER=date.test             # Run specific test
 *   make test-ai FILTER=tests/unit/lib        # Run directory
 *   make test-ai FILTER="date store geo"      # Multiple patterns (space-separated)
 *   make test-ai FILTER="date|store|geo"      # Multiple patterns (pipe-separated)
 *
 * Via pnpm:
 *   pnpm test:ai                              # Run all tests
 *   pnpm test:ai date.test                    # Run specific test
 *   pnpm test:ai date store geo               # Multiple patterns (space-separated)
 *   pnpm test:ai "date|store|geo"             # Multiple patterns (pipe-separated)
 *
 * Performance: Pattern filters are 24-120x faster than running all tests.
 *
 * @module
 * @category Scripts
 */
import fs from "node:fs";
import path from "node:path";

import { runPnpmSync } from "./run-pnpm";

const MAX_RESULT_FILES = 50;

interface TestResult {
  name: string;
  status: string;
  message?: string;
  duration?: number;
  assertionResults: Array<{ status: string; title: string; failureMessages?: string[] }>;
}

interface TestSummary {
  success: boolean;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numSkippedTests?: number;
  numPendingTests?: number;
  duration?: number;
  wallClockDuration?: number;
  startTime?: number;
  endTime?: number;
  testResults: TestResult[];
}

// Get filter arguments (everything after script name, excluding flags and --)
const filters = process.argv.slice(2).filter((arg) => !arg.startsWith("-") && arg !== "--");

// Support the documented space- and pipe-separated filter lists.
const processedFilters = filters.flatMap((filter): string[] => {
  const cleaned = filter.replace(/^\(/, "").replace(/\)$/, "");
  return cleaned.split(/[|\s]+/).filter(Boolean);
});

// Prepare timestamped output path
const startTime = Date.now();
const historyDir = path.join(process.cwd(), ".test-results");
fs.mkdirSync(historyDir, { recursive: true });
const timestamp = new Date(startTime)
  .toISOString()
  .replaceAll(":", "-")
  .replace(/\.\d+Z$/, "");
const resultsFilename = `${timestamp}-${process.pid}.json`;
const resultsPath = path.join(historyDir, resultsFilename);

// Build vitest command with timestamped output
const vitestArgs = [
  "exec",
  "vitest",
  "run",
  ...processedFilters,
  "--reporter=json",
  `--outputFile.json=.test-results/${resultsFilename}`,
  "--silent",
];

// Run vitest and track wall-clock time
let childFailed = false;
try {
  runPnpmSync(vitestArgs, {
    // The report is written to a file. Do not buffer unused stdout or swallow
    // stderr: worker crashes and startup failures may leave no usable report.
    stdio: ["ignore", "ignore", "inherit"],
    cwd: process.cwd(),
    env: { ...process.env, NODE_OPTIONS: "--no-warnings", DOTENV_CONFIG_SILENT: "true" },
  });
} catch {
  // Still read the report for diagnostics, but never hide a process failure.
  childFailed = true;
}
const endTime = Date.now();
const wallClockDuration = endTime - startTime;

try {
  // Only the report explicitly requested from this process belongs to this run.
  const results = JSON.parse(fs.readFileSync(resultsPath, "utf-8")) as TestSummary;
  const failedSuites = results.testResults.filter((suite) => suite.status === "failed");
  const hasFailed = childFailed || !results.success || results.numFailedTests > 0 || failedSuites.length > 0;

  // Add wall-clock duration to results and save back
  const enhancedResults = { ...results, success: !hasFailed, wallClockDuration, startTime, endTime };
  fs.writeFileSync(resultsPath, JSON.stringify(enhancedResults, null, 2));

  const status = hasFailed ? "❌" : "✅";
  const skipped = results.numSkippedTests ?? results.numPendingTests ?? 0;

  // Format duration as Xm Ys or just Xs
  const durationSec = wallClockDuration / 1000;
  const durationStr =
    durationSec >= 60
      ? ` (${Math.floor(durationSec / 60)}m ${Math.round(durationSec % 60)}s)`
      : ` (${durationSec.toFixed(1)}s)`;

  // Single line summary
  const skippedStr = skipped > 0 ? `, ${skipped} skipped` : "";
  const failedSuitesStr = failedSuites.length > 0 ? `, failed suites: ${failedSuites.length}` : "";
  console.log(
    `${status} ${results.numPassedTests} passed, ${results.numFailedTests} failed${skippedStr}${failedSuitesStr}${durationStr}`
  );

  // List failed test files if any
  if (results.numFailedTests > 0 || failedSuites.length > 0) {
    console.log(`Failed: ${failedSuites.map((suite) => suite.name).join(", ")}`);
    for (const suite of failedSuites) {
      if (suite.message) console.log(`${suite.name}: ${suite.message}`);
    }
  }

  // JSON location
  console.log(`→ .test-results/${resultsFilename}`);

  // Prune old results to the configured retention limit.
  const historyFiles = fs
    .readdirSync(historyDir)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));
  for (const file of historyFiles.slice(0, -MAX_RESULT_FILES)) {
    fs.unlinkSync(path.join(historyDir, file));
  }

  process.exit(hasFailed ? 1 : 0);
} catch {
  console.error(`❌ Could not read .test-results/${resultsFilename}`);
  console.error("   Run individual test suites to verify: make test-ai FILTER=<pattern>");
  process.exit(1);
}
