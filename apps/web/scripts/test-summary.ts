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

  // Print summary header
  console.log("\n" + "=".repeat(50));
  console.log("TEST EXECUTION SUMMARY");
  console.log("=".repeat(50));

  // Overall status
  if (results.success) {
    console.log("✅ ALL TESTS PASSED");
  } else {
    console.log("❌ TESTS FAILED");
  }

  // Statistics
  console.log(`\nTotal: ${results.numTotalTests} tests`);
  console.log(`  ✓ Passed: ${results.numPassedTests}`);
  console.log(`  ✗ Failed: ${results.numFailedTests}`);
  console.log(`  ○ Skipped: ${results.numSkippedTests ?? results.numPendingTests ?? 0}`);
  const duration = results.duration ?? results.testResults?.reduce((sum, t) => sum + (t.duration ?? 0), 0) ?? 0;
  console.log(`\nDuration: ${(duration / 1000).toFixed(2)}s`);

  // List failed tests if any
  if (results.numFailedTests > 0) {
    console.log("\n" + "-".repeat(50));
    console.log("FAILED TESTS:");
    console.log("-".repeat(50));

    results.testResults
      .filter((suite) => suite.status === "failed")
      .forEach((suite) => {
        console.log(`\n📁 ${suite.name}`);
        suite.assertionResults
          .filter((test) => test.status === "failed")
          .forEach((test) => {
            console.log(`  ✗ ${test.title}`);
            if (test.failureMessages?.[0]) {
              // Just show first line of error
              const firstLine = test.failureMessages[0].split("\n")[0];
              console.log(`    → ${firstLine?.substring(0, 100) ?? ""}`);
            }
          });
      });
  }

  console.log("\n" + "=".repeat(50));
  console.log("Full results saved in: .test-results.json");
  console.log("=".repeat(50) + "\n");

  // Exit with appropriate code
  process.exit(results.success ? 0 : 1);
} catch {
  console.error("❌ Could not read test results from .test-results.json");
  console.error("Make sure tests completed successfully.");
  process.exit(1);
}
