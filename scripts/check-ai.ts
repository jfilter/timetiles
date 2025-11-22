#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Repository-wide code quality check with AI-friendly output.
 *
 * Uses Turbo to run lint/typecheck in parallel across all packages,
 * then collects results and provides a clean summary.
 *
 * @module
 * @category Scripts
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

interface LintResult {
  filePath: string;
  errorCount: number;
  warningCount: number;
}

interface TypeCheckResult {
  success: boolean;
  errorCount: number;
}

interface PackageResults {
  package: string;
  lintSuccess: boolean;
  typecheckSuccess: boolean;
  lintErrors: number;
  lintWarnings: number;
  typecheckErrors: number;
}

const PACKAGES = [
  { name: "apps/web", hasLint: true, hasTypecheck: true },
  { name: "apps/docs", hasLint: true, hasTypecheck: true },
  { name: "packages/ui", hasLint: true, hasTypecheck: true },
  { name: "packages/eslint-config", hasLint: true, hasTypecheck: false },
  { name: "packages/prettier-config", hasLint: true, hasTypecheck: false },
  { name: "packages/typescript-config", hasLint: true, hasTypecheck: false },
];

// Main execution

// Run Turbo to execute lint and typecheck in parallel across all packages
// Use --output-logs=errors-only to suppress verbose output
// Use --continue to run all tasks even if some fail
try {
  execSync("pnpm turbo lint typecheck --continue --output-logs=errors-only", {
    stdio: "pipe", // Suppress Turbo's output, we'll show our own summary
  });
} catch {
  // Turbo exits with non-zero if any task fails, which is expected
}

const results: PackageResults[] = [];
let allPassed = true;

for (const pkg of PACKAGES) {
  const pkgPath = path.join(process.cwd(), pkg.name);
  if (!fs.existsSync(pkgPath)) {
    continue;
  }

  const lintPath = path.join(pkgPath, ".lint-results.json");
  const typecheckPath = path.join(pkgPath, ".typecheck-results.json");

  let lintErrors = 0;
  let lintWarnings = 0;
  let lintSuccess = true;
  let typecheckErrors = 0;
  let typecheckSuccess = true;

  // Read lint results
  if (pkg.hasLint && fs.existsSync(lintPath)) {
    try {
      const lintData = JSON.parse(fs.readFileSync(lintPath, "utf-8")) as LintResult[];
      lintData.forEach((file) => {
        lintErrors += file.errorCount || 0;
        lintWarnings += file.warningCount || 0;
      });
      lintSuccess = lintErrors === 0;
    } catch {
      // Ignore parse errors
    }
  }

  // Read typecheck results
  if (pkg.hasTypecheck && fs.existsSync(typecheckPath)) {
    try {
      const typecheckData = JSON.parse(fs.readFileSync(typecheckPath, "utf-8")) as TypeCheckResult;
      typecheckErrors = typecheckData.errorCount || 0;
      typecheckSuccess = typecheckData.success && typecheckErrors === 0;
    } catch {
      // Ignore parse errors
    }
  }

  const success = lintSuccess && typecheckSuccess;

  results.push({
    package: pkg.name,
    lintSuccess,
    typecheckSuccess,
    lintErrors,
    lintWarnings,
    typecheckErrors,
  });

  if (!success) {
    allPassed = false;
  }
}

const totalLintErrors = results.reduce((sum, r) => sum + r.lintErrors, 0);
const totalTypecheckErrors = results.reduce((sum, r) => sum + r.typecheckErrors, 0);
const totalErrors = totalLintErrors + totalTypecheckErrors;
const totalWarnings = results.reduce((sum, r) => sum + r.lintWarnings, 0);
const failedPackages = results.filter((r) => !r.lintSuccess || !r.typecheckSuccess);

console.log("=".repeat(70));
if (allPassed && totalWarnings === 0) {
  console.log("✅ ALL CHECKS PASSED - NO ISSUES FOUND");
} else if (allPassed) {
  console.log(`⚠️  ${totalWarnings} warnings (no errors)`);
} else {
  console.log(
    `❌ ${totalErrors} errors, ${totalWarnings} warnings across ${failedPackages.length} packages`
  );
}
console.log("=".repeat(70));

// Show sample errors (max 10)
if (totalErrors > 0) {
  console.log("\n📋 Sample errors (first 10):\n");

  let errorCount = 0;
  const maxErrors = 10;

  for (const pkg of failedPackages) {
    if (errorCount >= maxErrors) break;

    const pkgPath = path.join(process.cwd(), pkg.package);
    const packageName = pkg.package.replace(/^(apps|packages)\//, "");

    // Show TypeScript errors
    if (pkg.typecheckErrors > 0) {
      const typecheckPath = path.join(pkgPath, ".typecheck-results.json");
      if (fs.existsSync(typecheckPath)) {
        try {
          const typecheckData = JSON.parse(fs.readFileSync(typecheckPath, "utf-8")) as {
            errors?: Array<{ file: string; line: number; code: string; message: string }>;
          };

          if (typecheckData.errors) {
            for (const error of typecheckData.errors.slice(0, maxErrors - errorCount)) {
              const relPath = path.relative(process.cwd(), error.file);
              console.log(`  ${packageName}/${relPath}:${error.line}`);
              console.log(`    ${error.code}: ${error.message.substring(0, 80)}${error.message.length > 80 ? "..." : ""}`);
              errorCount++;
            }
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    // Show lint errors
    if (pkg.lintErrors > 0 && errorCount < maxErrors) {
      const lintPath = path.join(pkgPath, ".lint-results.json");
      if (fs.existsSync(lintPath)) {
        try {
          const lintData = JSON.parse(fs.readFileSync(lintPath, "utf-8")) as Array<{
            filePath: string;
            messages: Array<{
              ruleId: string | null;
              severity: number;
              message: string;
              line: number;
              column: number;
            }>;
          }>;

          for (const file of lintData) {
            if (errorCount >= maxErrors) break;
            const errors = file.messages.filter((m) => m.severity === 2);
            for (const error of errors.slice(0, maxErrors - errorCount)) {
              const relPath = path.relative(process.cwd(), file.filePath);
              console.log(`  ${relPath}:${error.line}:${error.column}`);
              console.log(
                `    ${error.ruleId || "lint"}: ${error.message.substring(0, 80)}${error.message.length > 80 ? "..." : ""}`
              );
              errorCount++;
            }
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }

  if (totalErrors > maxErrors) {
    console.log(`\n  ... and ${totalErrors - maxErrors} more errors`);
  }
}

// Show jq commands
console.log("\n" + "=".repeat(70));
console.log("💡 View all details with jq:");
console.log("=".repeat(70));

if (failedPackages.length > 0) {
  failedPackages.forEach((pkg) => {
    const pkgName = pkg.package.replace(/^(apps|packages)\//, "");
    if (pkg.lintErrors > 0) {
      console.log(`\n# ${pkgName} lint errors:`);
      console.log(`  cat ${pkg.package}/.lint-results.json | jq '.[] | select(.errorCount > 0)'`);
    }
    if (pkg.typecheckErrors > 0) {
      console.log(`\n# ${pkgName} typecheck errors:`);
      console.log(`  cat ${pkg.package}/.typecheck-results.json | jq '.errors[]'`);
    }
  });
} else {
  console.log("\n# Inspect any package:");
  console.log(`  cat apps/web/.lint-results.json | jq '.[] | select(.errorCount > 0)'`);
  console.log(`  cat apps/web/.typecheck-results.json | jq '.errors[]'`);
}

console.log("\n" + "=".repeat(70));

// Exit with appropriate code
process.exit(allPassed ? 0 : 1);
