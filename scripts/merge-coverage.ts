#!/usr/bin/env tsx
/**
 * Script to merge coverage reports from all packages in the monorepo.
 * 
 * This script collects coverage data from individual packages and creates
 * a unified coverage report at the root level.
 * 
 * @module
 */
import { execSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, copyFileSync, readFileSync } from "fs";
import { join } from "path";

const ROOT_DIR = process.cwd();
const COVERAGE_DIR = join(ROOT_DIR, "coverage");
const NYC_OUTPUT_DIR = join(ROOT_DIR, ".nyc_output");

// Ensure directories exist
if (!existsSync(NYC_OUTPUT_DIR)) {
  mkdirSync(NYC_OUTPUT_DIR, { recursive: true });
}

if (!existsSync(COVERAGE_DIR)) {
  mkdirSync(COVERAGE_DIR, { recursive: true });
}

console.log("🔍 Searching for coverage files...");

// Find all coverage files in the monorepo
const packages = ["apps/web", "packages/ui"];
let coverageFiles: string[] = [];

for (const pkg of packages) {
  const coverageFile = join(ROOT_DIR, pkg, "coverage", "coverage-final.json");
  if (existsSync(coverageFile)) {
    const destFile = join(NYC_OUTPUT_DIR, `coverage-${pkg.replace("/", "-")}.json`);
    copyFileSync(coverageFile, destFile);
    coverageFiles.push(destFile);
    console.log(`✅ Found coverage for ${pkg}`);
  }
}

if (coverageFiles.length === 0) {
  console.log("❌ No coverage files found. Run 'pnpm test:coverage' first.");
  process.exit(1);
}

console.log(`\n📊 Merging ${coverageFiles.length} coverage reports...`);

try {
  // Use nyc to merge and generate reports
  execSync(`npx nyc merge ${NYC_OUTPUT_DIR} ${join(COVERAGE_DIR, "coverage-final.json")}`, {
    stdio: "pipe",
  });

  // Generate text-summary for single number
  const summaryOutput = execSync(
    `npx nyc report --temp-dir ${NYC_OUTPUT_DIR} --reporter=text-summary`,
    {
      encoding: "utf8",
    }
  );

  // Generate full reports
  execSync(
    `npx nyc report --temp-dir ${NYC_OUTPUT_DIR} --report-dir ${COVERAGE_DIR} --reporter=text --reporter=lcov --reporter=html --reporter=json-summary`,
    {
      stdio: "inherit",
    }
  );

  // Parse and display the summary
  console.log("\n" + summaryOutput);

  // Extract overall percentage from summary
  const match = summaryOutput.match(/All files[^|]*\|\s*([\d.]+)/);
  if (match) {
    const overallCoverage = parseFloat(match[1]);
    console.log(`\n🎯 Overall Coverage: ${overallCoverage.toFixed(2)}%`);
  }

  // Also read from json-summary for more details
  const jsonSummaryPath = join(COVERAGE_DIR, "coverage-summary.json");
  if (existsSync(jsonSummaryPath)) {
    const summary = JSON.parse(readFileSync(jsonSummaryPath, "utf8"));
    const total = summary.total;
    
    console.log("\n📈 Coverage Breakdown:");
    console.log(`   Lines:      ${total.lines.pct}%`);
    console.log(`   Statements: ${total.statements.pct}%`);
    console.log(`   Functions:  ${total.functions.pct}%`);
    console.log(`   Branches:   ${total.branches.pct}%`);
  }

  console.log("\n✨ Coverage report generated successfully!");
  console.log(`📁 HTML report: ${join(COVERAGE_DIR, "index.html")}`);
} catch (error) {
  console.error("❌ Failed to merge coverage reports:", error);
  process.exit(1);
}