#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Test results summary script.
 *
 * Reads test results from .test-results.json and displays
 * a formatted summary with statistics and failure details.
 *
 * @module
 * @category Scripts
 */
import fs from "fs";
import path from "path";

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
