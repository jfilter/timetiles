#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * File-scoped code quality check with AI-friendly output.
 *
 * Runs format (oxfmt) and lint (oxlint) on specified files only, and runs
 * typecheck (tsgo) on the full project but filters output to the specified files.
 *
 * Usage: tsx scripts/check-ai-files.ts <package> <file1> [file2] ...
 * Example: tsx scripts/check-ai-files.ts apps/web lib/services/foo.ts components/bar.tsx
 *
 * @module
 * @category Scripts
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { reportFormatSection, runFormatCheck } from "./shared/format-utils";

/**
 * Fatal problems with the checking tools themselves (crashed, missing, or ran
 * over zero files). These are kept separate from lint/type findings: a tool
 * that never ran is not a clean result, and must never be reported as one.
 */
const toolFailures: string[] = [];

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

// --- Format: run oxfmt --check repo-wide ---
// Deliberately NOT scoped to the checked files: CI runs oxfmt over the whole tree,
// so scoping here would report green while CI fails on an untouched file.
// A full pass takes ~2s, which is cheaper than a red CI run.
const formatResult = runFormatCheck([], process.cwd());
const unformattedFiles = formatResult.unformatted;
if (formatResult.toolError !== undefined) {
  toolFailures.push(formatResult.toolError);
}

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
  /** Number of files oxlint actually linted. 0 means it never looked at anything. */
  number_of_files?: number;
}

/**
 * Pull the JSON object out of oxlint's output.
 *
 * oxlint prefixes its JSON with human-readable notices on some paths (e.g.
 * "No files found to lint."), so a bare `JSON.parse` of the whole stream throws
 * on exactly the runs we most need to notice.
 */
const extractJsonObject = (raw: string): OxlintOutput | null => {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as OxlintOutput;
  } catch {
    return null;
  }
};

let lintErrors = 0;
let lintWarnings = 0;
/** True only once oxlint has demonstrably linted at least one file. */
let lintRan = false;
const lintIssues: Array<{
  file: string;
  line: number;
  column: number;
  rule: string;
  message: string;
  severity: string;
}> = [];

const configPath = path.resolve(process.cwd(), ".oxlintrc.json");

// spawnSync with an argument array — NOT a shell string. Interpolating the file
// list into a shell command word-splits any path containing a space, so oxlint
// silently linted zero files and the run was reported as passing.
const lintRun = spawnSync("pnpm", ["exec", "oxlint", "--config", configPath, "--format=json", ...relativeToPackage], {
  encoding: "utf-8",
  cwd: pkgPath,
});

const lintOutput = (lintRun.stdout ?? "") + "\n" + (lintRun.stderr ?? "");
const lintResult = extractJsonObject(lintOutput);

if (lintRun.error) {
  toolFailures.push(`oxlint could not be started: ${lintRun.error.message}`);
} else if (lintResult === null) {
  toolFailures.push(
    `oxlint produced no parseable JSON (exit code ${lintRun.status ?? "signal " + lintRun.signal}).\n` +
      `    Output: ${lintOutput.trim().split("\n").slice(0, 5).join("\n            ") || "(empty)"}`
  );
} else if ((lintResult.number_of_files ?? 0) === 0) {
  // oxlint ran but looked at nothing — a bad path or a file excluded by
  // ignorePatterns. Reporting this as "no lint issues" is what let broken
  // invocations pass for so long.
  toolFailures.push(
    `oxlint linted 0 files. The requested paths matched nothing, or every one of\n` +
      `    them is excluded by ignorePatterns in .oxlintrc.json:\n` +
      relativeToPackage.map((f) => `      ${f}`).join("\n")
  );
} else {
  lintRan = true;
  for (const diag of lintResult.diagnostics) {
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

  if (lintResult.number_of_files !== undefined && lintResult.number_of_files < relativeToPackage.length) {
    console.log(
      `\n⚠  oxlint linted ${lintResult.number_of_files} of ${relativeToPackage.length} requested files ` +
        `(the rest are excluded by ignorePatterns).`
    );
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
/** True unless tsgo failed to start or died without parseable diagnostics. */
let typecheckRan = true;
const typecheckIssues: TypeScriptError[] = [];

// Normalize file paths for matching (resolve to absolute)
const targetFilesSet = new Set(resolvedFiles.map((f) => path.resolve(f)));

const typecheckRun = spawnSync("pnpm", ["exec", "tsgo", "--noEmit", "--pretty", "false"], {
  encoding: "utf-8",
  cwd: pkgPath,
});

if (typecheckRun.error) {
  typecheckRan = false;
  toolFailures.push(`tsgo could not be started: ${typecheckRun.error.message}`);
} else if (typecheckRun.status !== 0) {
  const output = (typecheckRun.stdout ?? "") + "\n" + (typecheckRun.stderr ?? "");
  const lines = output.split("\n");
  // Diagnostics anywhere in the project, before filtering down to our files.
  // Used to tell "tsgo reported real errors elsewhere" apart from "tsgo broke".
  let sawAnyDiagnostic = false;

  // eslint-disable-next-line sonarjs/slow-regex, regexp/no-super-linear-backtracking
  const diagnosticPattern = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.*)$/;
  let currentError: TypeScriptError | null = null;

  for (const line of lines) {
    const match = diagnosticPattern.exec(line);
    if (match?.[1] && match[2] && match[3] && match[4] && match[5] && match[6]) {
      sawAnyDiagnostic = true;
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
        line: Number.parseInt(match[2], 10),
        column: Number.parseInt(match[3], 10),
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

  // tsgo failed but emitted nothing we could parse — a bad tsconfig, a crash, or
  // an OOM. Treating that as "no type errors in specified files" turned a broken
  // typechecker into a green gate.
  if (!sawAnyDiagnostic) {
    typecheckRan = false;
    toolFailures.push(
      `tsgo exited ${typecheckRun.status} without any parseable diagnostics.\n` +
        `    Output: ${output.trim().split("\n").slice(0, 5).join("\n            ") || "(empty)"}`
    );
  }
}

// --- Output ---
const formatErrors = unformattedFiles.length;
const totalErrors = formatErrors + lintErrors + typecheckErrors + toolFailures.length;

reportFormatSection(formatResult);

console.log("\n" + "-".repeat(70));
console.log("LINT:");
console.log("-".repeat(70));
if (!lintRan) {
  console.log("❌ oxlint did not run — see TOOL FAILURES below");
} else if (lintErrors === 0 && lintWarnings === 0) {
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
if (!typecheckRan) {
  console.log("❌ tsgo did not run to completion — see TOOL FAILURES below");
} else if (typecheckErrors === 0) {
  console.log("✅ No type errors in specified files");
} else {
  console.log(`${typecheckErrors} errors`);
  for (const issue of typecheckIssues) {
    console.log(`  ✗ ${issue.file}:${issue.line}:${issue.column}`);
    console.log(`    ${issue.code}: ${issue.message}`);
  }
}

if (toolFailures.length > 0) {
  console.log("\n" + "-".repeat(70));
  console.log("TOOL FAILURES:");
  console.log("-".repeat(70));
  console.log("A check could not be performed. This is NOT a passing result.");
  for (const failure of toolFailures) {
    console.log(`  ✗ ${failure}`);
  }
}

console.log("\n" + "=".repeat(70));
if (totalErrors === 0) {
  console.log("✅ ALL CHECKS PASSED for specified files");
} else {
  console.log(
    `❌ ${totalErrors} errors found (${formatErrors} format, ${lintErrors} lint, ` +
      `${typecheckErrors} typecheck, ${toolFailures.length} tool failures)`
  );
}
console.log("=".repeat(70));

process.exit(totalErrors > 0 ? 1 : 0);
