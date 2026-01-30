#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * File-scoped code quality check with AI-friendly output.
 *
 * Runs lint (oxlint) on specified files only, and runs typecheck (tsgo)
 * on the full project but filters output to the specified files.
 *
 * Usage: tsx scripts/check-ai-files.ts <package> <file1> [file2] ...
 * Example: tsx scripts/check-ai-files.ts apps/web lib/services/foo.ts components/bar.tsx
 *
 * @module
 * @category Scripts
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: check-ai-files.ts <package-dir> <file1> [file2] ...");
  console.error("Example: check-ai-files.ts apps/web lib/services/foo.ts");
  process.exit(1);
}

const pkgDir = args[0]!;
const files = args.slice(1);
const pkgPath = path.resolve(process.cwd(), pkgDir);

if (!fs.existsSync(pkgPath)) {
  console.error(`Package directory not found: ${pkgPath}`);
  process.exit(1);
}

// Resolve files relative to package directory
const resolvedFiles = files.map((f) => path.resolve(pkgPath, f));
const missingFiles = resolvedFiles.filter((f) => !fs.existsSync(f));
if (missingFiles.length > 0) {
  console.error("Files not found:");
  missingFiles.forEach((f) => console.error(`  ${path.relative(process.cwd(), f)}`));
  process.exit(1);
}

const relativeToPackage = resolvedFiles.map((f) => path.relative(pkgPath, f));
const relativeToRoot = resolvedFiles.map((f) => path.relative(process.cwd(), f));

console.log("=".repeat(70));
console.log(`FILE-SCOPED CHECK: ${relativeToRoot.join(", ")}`);
console.log("=".repeat(70));

// --- Lint: run oxlint on specified files only ---
interface OxlintDiagnostic {
  message: string;
  code: string;
  severity: "error" | "warning";
  filename: string;
  labels: Array<{ span: { offset: number; length: number; line: number; column: number } }>;
}

interface OxlintOutput {
  diagnostics: OxlintDiagnostic[];
}

let lintErrors = 0;
let lintWarnings = 0;
const lintIssues: Array<{
  file: string;
  line: number;
  column: number;
  rule: string;
  message: string;
  severity: string;
}> = [];

const configPath = path.resolve(process.cwd(), ".oxlintrc.json");
const fileArgs = relativeToPackage.join(" ");

try {
  const output = execSync(`pnpm exec oxlint --config ${configPath} --format=json ${fileArgs} 2>&1`, {
    encoding: "utf-8",
    cwd: pkgPath,
  });

  const result: OxlintOutput = JSON.parse(output);
  for (const diag of result.diagnostics) {
    const severity = diag.severity === "error" ? "error" : "warning";
    if (severity === "error") lintErrors++;
    else lintWarnings++;
    const label = diag.labels[0];
    lintIssues.push({
      file: diag.filename,
      line: label?.span.line ?? 1,
      column: label?.span.column ?? 1,
      rule: diag.code,
      message: diag.message,
      severity,
    });
  }
} catch (error) {
  const errorWithOutput = error as { stdout?: string | Buffer };
  const stdout = errorWithOutput.stdout?.toString() ?? "";
  try {
    const result: OxlintOutput = JSON.parse(stdout);
    for (const diag of result.diagnostics) {
      const severity = diag.severity === "error" ? "error" : "warning";
      if (severity === "error") lintErrors++;
      else lintWarnings++;
      const label = diag.labels[0];
      lintIssues.push({
        file: diag.filename,
        line: label?.span.line ?? 1,
        column: label?.span.column ?? 1,
        rule: diag.code,
        message: diag.message,
        severity,
      });
    }
  } catch {
    // Could not parse output
  }
}

// --- Typecheck: run tsgo on full project, filter to specified files ---
interface TypeScriptError {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
  severity: "error" | "warning";
}

let typecheckErrors = 0;
const typecheckIssues: TypeScriptError[] = [];

// Normalize file paths for matching (resolve to absolute)
const targetFilesSet = new Set(resolvedFiles.map((f) => path.resolve(f)));

try {
  execSync("pnpm exec tsgo --noEmit --pretty false 2>&1", {
    encoding: "utf-8",
    cwd: pkgPath,
  });
  // No errors at all
} catch (error) {
  const errorWithOutput = error as { stdout?: string | Buffer; stderr?: string | Buffer };
  const stdout = errorWithOutput.stdout?.toString() ?? "";
  const stderr = errorWithOutput.stderr?.toString() ?? "";
  const output = stdout + "\n" + stderr;
  const lines = output.split("\n");

  // eslint-disable-next-line sonarjs/slow-regex, regexp/no-super-linear-backtracking
  const diagnosticPattern = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.*)$/;
  let currentError: TypeScriptError | null = null;

  for (const line of lines) {
    const match = diagnosticPattern.exec(line);
    if (match?.[1] && match[2] && match[3] && match[4] && match[5] && match[6]) {
      // Save previous error if it matches our files
      if (currentError) {
        const absPath = path.resolve(pkgPath, currentError.file);
        if (targetFilesSet.has(absPath)) {
          typecheckIssues.push(currentError);
          if (currentError.severity === "error") typecheckErrors++;
        }
      }

      currentError = {
        file: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        code: match[5],
        message: match[6],
        severity: match[4] as "error" | "warning",
      };
    } else if (currentError && line.trim() && !/^\s*$/.test(line)) {
      currentError.message += " " + line.trim();
    }
  }

  // Don't forget the last error
  if (currentError) {
    const absPath = path.resolve(pkgPath, currentError.file);
    if (targetFilesSet.has(absPath)) {
      typecheckIssues.push(currentError);
      if (currentError.severity === "error") typecheckErrors++;
    }
  }
}

// --- Output ---
const totalErrors = lintErrors + typecheckErrors;

console.log("\n" + "-".repeat(70));
console.log("LINT:");
console.log("-".repeat(70));
if (lintErrors === 0 && lintWarnings === 0) {
  console.log("✅ No lint issues");
} else {
  console.log(`${lintErrors} errors, ${lintWarnings} warnings`);
  for (const issue of lintIssues) {
    const marker = issue.severity === "error" ? "✗" : "⚠";
    console.log(`  ${marker} ${issue.file}:${issue.line}:${issue.column}`);
    console.log(`    ${issue.rule}: ${issue.message}`);
  }
}

console.log("\n" + "-".repeat(70));
console.log("TYPECHECK:");
console.log("-".repeat(70));
if (typecheckErrors === 0) {
  console.log("✅ No type errors in specified files");
} else {
  console.log(`${typecheckErrors} errors`);
  for (const issue of typecheckIssues) {
    console.log(`  ✗ ${issue.file}:${issue.line}:${issue.column}`);
    console.log(`    ${issue.code}: ${issue.message}`);
  }
}

console.log("\n" + "=".repeat(70));
if (totalErrors === 0) {
  console.log("✅ ALL CHECKS PASSED for specified files");
} else {
  console.log(`❌ ${totalErrors} errors found (${lintErrors} lint, ${typecheckErrors} typecheck)`);
}
console.log("=".repeat(70));

process.exit(totalErrors > 0 ? 1 : 0);
