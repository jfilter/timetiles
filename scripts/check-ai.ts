#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Repository-wide code quality check with AI-friendly output.
 *
 * Runs fast lint (oxlint) and typecheck (tsgo) with JSON output,
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

interface ResultFileInfo {
  path: string | null;
  mtimeMs: number;
}

interface CheckRunResult {
  resultPath: string | null;
  runnerError: string | null;
}

interface PackageResults {
  package: string;
  lintSuccess: boolean;
  typecheckSuccess: boolean;
  lintErrors: number;
  lintWarnings: number;
  typecheckErrors: number;
  lintResultPath: string | null;
  typecheckResultPath: string | null;
  lintRunnerError: string | null;
  typecheckRunnerError: string | null;
}

const PACKAGES = [
  { name: "apps/web", hasLint: true, hasTypecheck: true },
  { name: "apps/docs", hasLint: true, hasTypecheck: true },
  { name: "packages/ui", hasLint: true, hasTypecheck: true },
  { name: "apps/timescrape", hasLint: true, hasTypecheck: true },
  { name: "packages/eslint-config", hasLint: true, hasTypecheck: false },
  { name: "packages/typescript-config", hasLint: true, hasTypecheck: false },
];

const scriptsDir = path.dirname(new URL(import.meta.url).pathname);

/** Find the latest JSON file in a results directory with its modification time. */
function getLatestResultInfo(dir: string): ResultFileInfo {
  if (!fs.existsSync(dir)) {
    return { path: null, mtimeMs: 0 };
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((file) => {
      const filePath = path.join(dir, file);
      return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs || b.filePath.localeCompare(a.filePath));

  if (files.length === 0) {
    return { path: null, mtimeMs: 0 };
  }

  const latestFile = files[0]!;
  return { path: latestFile.filePath, mtimeMs: latestFile.mtimeMs };
}

function summarizeCommandFailure(error: unknown): string {
  const errorWithOutput = error as { stdout?: string | Buffer; stderr?: string | Buffer; message?: string };
  const output =
    [errorWithOutput.stdout?.toString(), errorWithOutput.stderr?.toString()].filter(Boolean).join("\n").trim() ||
    errorWithOutput.message ||
    "Command failed before writing results.";

  return output.split(/\r?\n/).filter(Boolean).slice(0, 4).join(" ");
}

function truncateMessage(message: string, maxLength = 80): string {
  return message.length > maxLength ? `${message.substring(0, maxLength)}...` : message;
}

function runCheckWithFreshResults(command: string, cwd: string, resultDir: string): CheckRunResult {
  const before = getLatestResultInfo(resultDir);
  let failureSummary: string | null = null;

  try {
    execSync(command, { cwd, stdio: "pipe" });
  } catch (error) {
    // Expected to fail when a check reports errors, but still useful for runner failures.
    failureSummary = summarizeCommandFailure(error);
  }

  const after = getLatestResultInfo(resultDir);
  const hasFreshResult = after.path !== null && (after.path !== before.path || after.mtimeMs > before.mtimeMs);

  if (hasFreshResult) {
    return { resultPath: after.path, runnerError: null };
  }

  const relativeDir = path.relative(process.cwd(), resultDir);
  const runnerError =
    failureSummary ?? `Check helper completed without writing a fresh results file in ${relativeDir}.`;

  return {
    resultPath: null,
    runnerError: `Check helper failed before writing fresh results for ${relativeDir}: ${runnerError}`,
  };
}

const runResults = new Map<string, { lint: CheckRunResult | null; typecheck: CheckRunResult | null }>();

// Run checks for each package
// Note: Running sequentially to avoid overwhelming the system
// The fast tools (oxlint, tsgo) are already very fast
for (const pkg of PACKAGES) {
  const pkgPath = path.join(process.cwd(), pkg.name);
  if (!fs.existsSync(pkgPath)) {
    continue;
  }

  const packageRunResults = { lint: null as CheckRunResult | null, typecheck: null as CheckRunResult | null };

  if (pkg.hasLint) {
    packageRunResults.lint = runCheckWithFreshResults(
      `tsx ${path.join(scriptsDir, "lint-fast-with-json.ts")}`,
      pkgPath,
      path.join(pkgPath, ".lint-results")
    );
  }

  if (pkg.hasTypecheck) {
    packageRunResults.typecheck = runCheckWithFreshResults(
      `tsx ${path.join(scriptsDir, "typecheck-fast-with-json.ts")}`,
      pkgPath,
      path.join(pkgPath, ".typecheck-results")
    );
  }

  runResults.set(pkg.name, packageRunResults);
}

const results: PackageResults[] = [];
let allPassed = true;

for (const pkg of PACKAGES) {
  const pkgPath = path.join(process.cwd(), pkg.name);
  if (!fs.existsSync(pkgPath)) {
    continue;
  }

  const packageRunResults = runResults.get(pkg.name);
  const lintPath = packageRunResults?.lint?.resultPath ?? null;
  const typecheckPath = packageRunResults?.typecheck?.resultPath ?? null;

  let lintErrors = 0;
  let lintWarnings = 0;
  let lintSuccess = true;
  let typecheckErrors = 0;
  let typecheckSuccess = true;
  let lintRunnerError = packageRunResults?.lint?.runnerError ?? null;
  let typecheckRunnerError = packageRunResults?.typecheck?.runnerError ?? null;

  // Read lint results
  if (pkg.hasLint && lintPath) {
    try {
      const lintData = JSON.parse(fs.readFileSync(lintPath, "utf-8")) as LintResult[];
      lintData.forEach((file) => {
        lintErrors += file.errorCount || 0;
        lintWarnings += file.warningCount || 0;
      });
    } catch {
      lintRunnerError ??= `Could not parse lint results from ${path.relative(process.cwd(), lintPath)}.`;
    }
  }

  // Read typecheck results
  if (pkg.hasTypecheck && typecheckPath) {
    try {
      const typecheckData = JSON.parse(fs.readFileSync(typecheckPath, "utf-8")) as TypeCheckResult;
      typecheckErrors = typecheckData.errorCount || 0;
      typecheckSuccess = typecheckData.success && typecheckErrors === 0;
    } catch {
      typecheckRunnerError ??= `Could not parse typecheck results from ${path.relative(process.cwd(), typecheckPath)}.`;
    }
  }

  if (lintRunnerError) {
    lintErrors = Math.max(lintErrors, 1);
    lintSuccess = false;
  } else if (pkg.hasLint) {
    lintSuccess = lintErrors === 0;
  }

  if (typecheckRunnerError) {
    typecheckErrors = Math.max(typecheckErrors, 1);
    typecheckSuccess = false;
  }

  const success = lintSuccess && typecheckSuccess;

  results.push({
    package: pkg.name,
    lintSuccess,
    typecheckSuccess,
    lintErrors,
    lintWarnings,
    typecheckErrors,
    lintResultPath: lintPath,
    typecheckResultPath: typecheckPath,
    lintRunnerError,
    typecheckRunnerError,
  });

  if (!success) {
    allPassed = false;
  }
}

const totalLintErrors = results.reduce((sum, r) => sum + r.lintErrors, 0);
const totalTypecheckErrors = results.reduce((sum, r) => sum + r.typecheckErrors, 0);
const totalErrors = totalLintErrors + totalTypecheckErrors;
const totalWarnings = results.reduce((sum, r) => sum + r.lintWarnings, 0);
const totalRunnerFailures = results.reduce(
  (sum, r) => sum + (r.lintRunnerError ? 1 : 0) + (r.typecheckRunnerError ? 1 : 0),
  0
);
const failedPackages = results.filter((r) => !r.lintSuccess || !r.typecheckSuccess);

console.log("=".repeat(70));
if (allPassed && totalWarnings === 0) {
  console.log("✅ ALL CHECKS PASSED - NO ISSUES FOUND");
} else if (allPassed) {
  console.log(`⚠️  ${totalWarnings} warnings (no errors)`);
} else {
  const runnerFailureSummary = totalRunnerFailures > 0 ? `, ${totalRunnerFailures} runner failures` : "";
  console.log(
    `❌ ${totalErrors} errors, ${totalWarnings} warnings${runnerFailureSummary} across ${failedPackages.length} packages`
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

    const packageName = pkg.package.replace(/^(apps|packages)\//, "");

    if (pkg.lintRunnerError && errorCount < maxErrors) {
      console.log(`  ${packageName}/lint`);
      console.log(`    runner: ${truncateMessage(pkg.lintRunnerError)}`);
      errorCount++;
    }

    if (pkg.typecheckRunnerError && errorCount < maxErrors) {
      console.log(`  ${packageName}/typecheck`);
      console.log(`    runner: ${truncateMessage(pkg.typecheckRunnerError)}`);
      errorCount++;
    }

    // Show TypeScript errors
    if (pkg.typecheckErrors > 0 && pkg.typecheckResultPath) {
      try {
        const typecheckData = JSON.parse(fs.readFileSync(pkg.typecheckResultPath, "utf-8")) as {
          errors?: Array<{ file: string; line: number; code: string; message: string }>;
        };

        if (typecheckData.errors) {
          for (const error of typecheckData.errors.slice(0, maxErrors - errorCount)) {
            const relPath = path.relative(process.cwd(), error.file);
            console.log(`  ${packageName}/${relPath}:${error.line}`);
            console.log(`    ${error.code}: ${truncateMessage(error.message)}`);
            errorCount++;
          }
        }
      } catch {
        // Ignore parse errors here; they are already surfaced as runner failures above.
      }
    }

    // Show lint errors
    if (pkg.lintErrors > 0 && errorCount < maxErrors && pkg.lintResultPath) {
      try {
        const lintData = JSON.parse(fs.readFileSync(pkg.lintResultPath, "utf-8")) as Array<{
          filePath: string;
          messages: Array<{ ruleId: string | null; severity: number; message: string; line: number; column: number }>;
        }>;

        for (const file of lintData) {
          if (errorCount >= maxErrors) break;
          const errors = file.messages.filter((m) => m.severity === 2);
          for (const error of errors.slice(0, maxErrors - errorCount)) {
            const relPath = path.relative(process.cwd(), file.filePath);
            console.log(`  ${relPath}:${error.line}:${error.column}`);
            console.log(`    ${error.ruleId ?? "lint"}: ${truncateMessage(error.message)}`);
            errorCount++;
          }
        }
      } catch {
        // Ignore parse errors here; they are already surfaced as runner failures above.
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
    if (pkg.lintErrors > 0 && pkg.lintResultPath) {
      console.log(`\n# ${pkgName} lint errors:`);
      console.log(
        `  cat ${pkg.package}/.lint-results/$(ls -t ${pkg.package}/.lint-results/ | head -1) | jq '.[] | select(.errorCount > 0)'`
      );
    }
    if (pkg.typecheckErrors > 0 && pkg.typecheckResultPath) {
      console.log(`\n# ${pkgName} typecheck errors:`);
      console.log(
        `  cat ${pkg.package}/.typecheck-results/$(ls -t ${pkg.package}/.typecheck-results/ | head -1) | jq '.errors[]'`
      );
    }
  });
} else {
  console.log("\n# Inspect any package:");
  console.log(
    `  cat apps/web/.lint-results/$(ls -t apps/web/.lint-results/ | head -1) | jq '.[] | select(.errorCount > 0)'`
  );
  console.log(`  cat apps/web/.typecheck-results/$(ls -t apps/web/.typecheck-results/ | head -1) | jq '.errors[]'`);
}

console.log("\n" + "=".repeat(70));

// Exit with appropriate code
process.exit(allPassed ? 0 : 1);
