#!/usr/bin/env tsx
/**
 * Script to display a simple coverage summary number.
 * 
 * Reads the coverage summary from the last test run and displays
 * a single overall coverage percentage.
 * 
 * @module
 */
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

// Find the monorepo root by looking for the root package.json with "timetiles" name
function findMonorepoRoot(startPath: string = process.cwd()): string {
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
}

const ROOT_DIR = findMonorepoRoot();
const CURRENT_DIR = process.cwd();

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
  possiblePaths.forEach(p => console.error(`   - ${p}`));
  console.error("\n   Run 'pnpm test:coverage' first to generate coverage data.");
  process.exit(1);
}

try {
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  const total = summary.total;
  
  // Calculate overall coverage (average of all metrics)
  const overall = (
    total.lines.pct +
    total.statements.pct +
    total.functions.pct +
    total.branches.pct
  ) / 4;
  
  // Simple one-line output
  if (process.argv.includes("--simple")) {
    console.log(overall.toFixed(2));
  } else {
    console.log(`\n🎯 Coverage (${source}): ${overall.toFixed(2)}%\n`);
    
    if (process.argv.includes("--details")) {
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