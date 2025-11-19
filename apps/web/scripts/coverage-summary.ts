#!/usr/bin/env tsx
/**
 * Script to display coverage summaries and check coverage thresholds.
 *
 * Reads the coverage summary from the last test run and displays
 * overall coverage or files below a specified threshold.
 *
 * Usage:
 *   tsx coverage-summary.ts                 # Overall coverage
 *   tsx coverage-summary.ts --simple        # Just the number
 *   tsx coverage-summary.ts --details       # Breakdown by metric
 *   tsx coverage-summary.ts --threshold 80  # Files below 80%
 *
 * @module
 */
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

// Find the monorepo root by looking for the root package.json with "timetiles" name
const findMonorepoRoot = (startPath: string = process.cwd()): string => {
  let currentPath = resolve(startPath);

  while (currentPath !== "/") {
    const packageJsonPath = join(currentPath, "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
        if (packageJson.name === "timetiles") {
          return currentPath;
        }
      } catch {}
    }
    const parentPath = resolve(currentPath, "..");
    if (parentPath === currentPath) break;
    currentPath = parentPath;
  }

  // Fallback to assuming we're somewhere in the monorepo
  return resolve(startPath);
};

const ROOT_DIR = findMonorepoRoot();
const CURRENT_DIR = process.cwd();

// Parse command line arguments
const args = process.argv.slice(2);
const getArgValue = (flag: string, defaultValue: string): string => {
  const index = args.indexOf(flag);
  if (index !== -1) {
    const value = args[index + 1];
    if (value !== undefined) {
      return value;
    }
  }
  return defaultValue;
};

const showSimple = args.includes("--simple");
const showDetails = args.includes("--details");
const showThreshold = args.includes("--threshold");
const threshold = parseFloat(getArgValue("--threshold", "80"));

// Try multiple locations for coverage files
const possiblePaths = [
  // Current directory coverage
  join(CURRENT_DIR, "coverage", "coverage-summary.json"),
  // Web app coverage (from root)
  join(ROOT_DIR, "apps", "web", "coverage", "coverage-summary.json"),
  // Root merged coverage
  join(ROOT_DIR, "coverage", "coverage-summary.json"),
  // If we're in apps/web, check local coverage
  join(CURRENT_DIR, "..", "..", "apps", "web", "coverage", "coverage-summary.json"),
];

let summaryPath: string | null = null;
let source = "unknown";

for (const path of possiblePaths) {
  if (existsSync(path)) {
    summaryPath = path;
    // Determine source based on path
    if (path.includes("apps/web")) {
      source = "apps/web";
    } else if (path.includes(join(ROOT_DIR, "coverage"))) {
      source = "monorepo";
    } else if (path.startsWith(CURRENT_DIR)) {
      source = "current directory";
    }
    break;
  }
}

if (!summaryPath) {
  console.error("❌ No coverage summary found.");
  console.error("   Searched in:");
  possiblePaths.forEach((p) => console.error(`   - ${p}`));
  console.error("\n   Run 'pnpm test:coverage' first to generate coverage data.");
  process.exit(1);
}

try {
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  const total = summary.total;

  // Calculate overall coverage (average of all metrics)
  const overall = (total.lines.pct + total.statements.pct + total.functions.pct + total.branches.pct) / 4;

  // Helper to format file path
  const formatPath = (fullPath: string): string => {
    return fullPath.replace(ROOT_DIR + "/apps/web/", "");
  };

  // Helper to format coverage percentage
  const formatCoverage = (pct: number): string => {
    return `${pct.toFixed(1).padStart(5)}%`;
  };

  // Threshold mode: show files below threshold
  if (showThreshold) {
    interface FileData {
      path: string;
      coverage: number;
      lines: { total: number; covered: number };
    }

    const files: FileData[] = Object.entries(summary)
      .filter(([key]) => key !== "total")
      .map(([path, data]: [string, any]) => ({
        path,
        coverage: data.lines.pct,
        lines: { total: data.lines.total, covered: data.lines.covered },
      }))
      .filter((file) => file.coverage < threshold)
      .sort((a, b) => a.coverage - b.coverage);

    console.log(`\n⚠️  Files Below ${threshold}% Coverage Threshold:`);
    console.log("━".repeat(60));

    if (files.length === 0) {
      console.log(`✅ All files meet or exceed ${threshold}% coverage!`);
    } else {
      files.forEach((file) => {
        const lineInfo = `(${file.lines.covered}/${file.lines.total} lines)`;
        console.log(`${formatCoverage(file.coverage)} ${formatPath(file.path)} ${lineInfo}`);
      });
      console.log(`\nFound ${files.length} file${files.length === 1 ? "" : "s"} below ${threshold}% threshold`);
    }
    console.log("");
  }
  // Simple one-line output
  else if (showSimple) {
    console.log(overall.toFixed(2));
  }
  // Default: overall summary
  else {
    console.log(`\n🎯 Coverage (${source}): ${overall.toFixed(2)}%\n`);

    if (showDetails) {
      console.log("📊 Breakdown:");
      console.log(`   Lines:      ${total.lines.pct}%`);
      console.log(`   Statements: ${total.statements.pct}%`);
      console.log(`   Functions:  ${total.functions.pct}%`);
      console.log(`   Branches:   ${total.branches.pct}%`);
      console.log("");
    }
  }
} catch (error) {
  console.error("❌ Failed to read coverage summary:", error);
  process.exit(1);
}
