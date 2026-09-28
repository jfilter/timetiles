#!/usr/bin/env tsx
/**
 * Code quality check with AI-friendly output. Formatting (oxfmt) is always
 * checked repo-wide, because CI checks the whole tree.
 *
 * Usage:
 *   tsx scripts/check-ai.ts                          lint + typecheck every package
 *   tsx scripts/check-ai.ts --files <pkg> <file...>  lint + typecheck the files only
 *   tsx scripts/check-ai.ts --format [path ...]      format check only
 *
 * `--files` lints the files with oxlint (no ESLint) and typechecks the whole
 * package, filtering diagnostics to the files.
 *
 * @module
 * @category Scripts
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { type FormatCheckResult, formatFailed, reportFormatSection, runFormatCheck } from "./shared/format-utils";
import { localBin } from "./shared/local-bin";
import { parseTscOutput, type TypeScriptError } from "./shared/typecheck-utils";

interface LintResult {
  filePath: string;
  errorCount: number;
  warningCount: number;
  messages: Array<{ ruleId: string | null; severity: number; message: string; line: number; column: number }>;
}

interface TypeCheckResult {
  success: boolean;
  errorCount: number;
  errors?: Array<{ file: string; line: number; code: string; message: string }>;
}

interface ResultFileInfo {
  path: string | null;
  mtimeMs: number;
}

interface CheckRunResult {
  resultPath: string | null;
  runnerError: string | null;
  commandFailure?: string | null;
}

interface CheckSummary {
  success: boolean;
  errors: number;
  warnings: number;
  runnerError: string | null;
  resultPath: string | null;
}

interface PackageResults {
  package: string;
  lint: CheckSummary;
  typecheck: CheckSummary;
}

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

interface LintIssue {
  file: string;
  line: number;
  column: number;
  rule: string;
  message: string;
  severity: string;
}

interface FileLintResult {
  errors: number;
  warnings: number;
  /** True only once oxlint has demonstrably linted at least one file. */
  ran: boolean;
  issues: LintIssue[];
}

interface FileTypecheckResult {
  errors: number;
  /** True unless tsgo failed to start or died without parseable diagnostics. */
  ran: boolean;
  issues: TypeScriptError[];
}

const PACKAGES = [
  { name: "apps/web", hasLint: true, hasTypecheck: true },
  { name: "apps/docs", hasLint: true, hasTypecheck: true },
  { name: "packages/ui", hasLint: true, hasTypecheck: true },
  { name: "packages/shared", hasLint: true, hasTypecheck: true },
  { name: "packages/scraper", hasLint: true, hasTypecheck: true },
  { name: "apps/timescrape", hasLint: true, hasTypecheck: true },
  { name: "packages/eslint-config", hasLint: true, hasTypecheck: false },
];

const MAX_SAMPLE_ERRORS = 10;

const log = (...lines: string[]): void => lines.forEach((line) => console.log(line));
const logError = (line: string): void => console.error(line);

const banner = (text: string, leadingNewline = false): void =>
  log((leadingNewline ? "\n" : "") + "=".repeat(70), text, "=".repeat(70));

const printSection = (title: string): void => log("\n" + "-".repeat(70), `${title}:`, "-".repeat(70));

const firstLines = (output: string): string =>
  output.trim().split("\n").slice(0, 5).join("\n            ") || "(empty)";

const relativeToCwd = (file: string): string => path.relative(process.cwd(), file);

const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf-8")) as T;

const truncateMessage = (message: string, maxLength = 80): string =>
  message.length > maxLength ? `${message.substring(0, maxLength)}...` : message;

/** Find the latest JSON file in a results directory with its modification time. */
const getLatestResultInfo = (dir: string): ResultFileInfo => {
  if (!fs.existsSync(dir)) {
    return { path: null, mtimeMs: 0 };
  }

  const [latestFile] = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((file) => {
      const filePath = path.join(dir, file);
      return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs || b.filePath.localeCompare(a.filePath));

  return latestFile ? { path: latestFile.filePath, mtimeMs: latestFile.mtimeMs } : { path: null, mtimeMs: 0 };
};

const summarizeCommandFailure = (error: unknown): string => {
  const errorWithOutput = error as { stdout?: string | Uint8Array; stderr?: string | Uint8Array; message?: string };
  const captured = [errorWithOutput.stdout?.toString(), errorWithOutput.stderr?.toString()]
    .filter(Boolean)
    .join("\n")
    .trim();
  const output = [captured, errorWithOutput.message].find(Boolean) ?? "Command failed before writing results.";

  return output.split(/\r?\n/).filter(Boolean).slice(0, 4).join(" ");
};

const runCheckWithFreshResults = (scriptPath: string, cwd: string, resultDir: string): CheckRunResult => {
  const before = getLatestResultInfo(resultDir);
  let failureSummary: string | null = null;

  try {
    execFileSync(localBin("tsx", cwd), [scriptPath], { cwd, stdio: "pipe" });
  } catch (error) {
    // Expected to fail when a check reports errors, but still useful for runner failures.
    failureSummary = summarizeCommandFailure(error);
  }

  const after = getLatestResultInfo(resultDir);
  const hasFreshResult = after.path !== null && (after.path !== before.path || after.mtimeMs > before.mtimeMs);

  if (hasFreshResult) {
    return { resultPath: after.path, runnerError: null, commandFailure: failureSummary };
  }

  const relativeDir = relativeToCwd(resultDir);
  const runnerError =
    failureSummary ?? `Check helper completed without writing a fresh results file in ${relativeDir}.`;

  return {
    resultPath: null,
    runnerError: `Check helper failed before writing fresh results for ${relativeDir}: ${runnerError}`,
  };
};

// A fresh report cannot override a failed command: ordinary diagnostic failures
// are counted from the report, anything else surfaces as a runner failure.
const summarizeLint = (run: CheckRunResult | null): CheckSummary => {
  let errors = 0;
  let warnings = 0;
  let runnerError = run?.runnerError ?? null;
  const resultPath = run?.resultPath ?? null;

  if (resultPath) {
    try {
      for (const file of readJson<LintResult[]>(resultPath)) {
        errors += file.errorCount || 0;
        warnings += file.warningCount || 0;
      }
    } catch {
      runnerError ??= `Could not parse lint results from ${relativeToCwd(resultPath)}.`;
    }
  }

  if (errors === 0) runnerError ??= run?.commandFailure ?? null;
  if (runnerError) errors = Math.max(errors, 1);
  return { success: runnerError === null && errors === 0, errors, warnings, runnerError, resultPath };
};

const summarizeTypecheck = (run: CheckRunResult | null): CheckSummary => {
  let errors = 0;
  let success = true;
  let runnerError = run?.runnerError ?? null;
  const resultPath = run?.resultPath ?? null;

  if (resultPath) {
    try {
      const typecheckData = readJson<TypeCheckResult>(resultPath);
      errors = typecheckData.errorCount || 0;
      success = typecheckData.success && errors === 0;
    } catch {
      runnerError ??= `Could not parse typecheck results from ${relativeToCwd(resultPath)}.`;
    }
  }

  if (success) runnerError ??= run?.commandFailure ?? null;
  if (runnerError) {
    errors = Math.max(errors, 1);
    success = false;
  }
  return { success, errors, warnings: 0, runnerError, resultPath };
};

const checkPackage = (pkg: (typeof PACKAGES)[number]): PackageResults => {
  const pkgPath = path.join(process.cwd(), pkg.name);
  const run = (script: string, resultDir: string) =>
    runCheckWithFreshResults(path.join(__dirname, script), pkgPath, path.join(pkgPath, resultDir));

  return {
    package: pkg.name,
    lint: summarizeLint(pkg.hasLint ? run("lint-fast-with-json.ts", ".lint-results") : null),
    typecheck: summarizeTypecheck(pkg.hasTypecheck ? run("typecheck-with-json.ts", ".typecheck-results") : null),
  };
};

const typecheckSamples = (resultPath: string, packageName: string): string[][] => {
  try {
    return (readJson<TypeCheckResult>(resultPath).errors ?? []).map((error) => [
      `  ${packageName}/${relativeToCwd(error.file)}:${error.line}`,
      `    ${error.code}: ${truncateMessage(error.message)}`,
    ]);
  } catch {
    return []; // Already surfaced as a runner failure.
  }
};

const lintSamples = (resultPath: string): string[][] => {
  try {
    return readJson<LintResult[]>(resultPath).flatMap((file) =>
      file.messages
        .filter((m) => m.severity === 2)
        .map((error) => [
          `  ${relativeToCwd(file.filePath)}:${error.line}:${error.column}`,
          `    ${error.ruleId ?? "lint"}: ${truncateMessage(error.message)}`,
        ])
    );
  } catch {
    return []; // Already surfaced as a runner failure.
  }
};

const sampleErrors = ({ package: name, lint, typecheck }: PackageResults): string[][] => {
  const packageName = name.replace(/^(apps|packages)\//, "");
  const samples: string[][] = [];
  if (lint.runnerError) samples.push([`  ${packageName}/lint`, `    runner: ${truncateMessage(lint.runnerError)}`]);
  if (typecheck.runnerError) {
    samples.push([`  ${packageName}/typecheck`, `    runner: ${truncateMessage(typecheck.runnerError)}`]);
  }
  if (typecheck.errors > 0 && typecheck.resultPath)
    samples.push(...typecheckSamples(typecheck.resultPath, packageName));
  if (lint.errors > 0 && lint.resultPath) samples.push(...lintSamples(lint.resultPath));
  return samples;
};

const repoHeadline = (results: PackageResults[], formatResult: FormatCheckResult, allPassed: boolean): string => {
  const totalWarnings = results.reduce((sum, r) => sum + r.lint.warnings, 0);
  if (allPassed) {
    return totalWarnings === 0 ? "✅ ALL CHECKS PASSED - NO ISSUES FOUND" : `⚠️  ${totalWarnings} warnings (no errors)`;
  }

  const totalFormatErrors = formatResult.unformatted.length;
  const totalErrors = results.reduce((sum, r) => sum + r.lint.errors + r.typecheck.errors, totalFormatErrors);
  // A crashed oxfmt run counts as a runner failure, so the headline never reads as clean.
  const totalRunnerFailures = results.reduce(
    (sum, r) => sum + (r.lint.runnerError ? 1 : 0) + (r.typecheck.runnerError ? 1 : 0),
    formatResult.toolError === undefined ? 0 : 1
  );
  const failedPackages = results.filter((r) => !r.lint.success || !r.typecheck.success).length;

  const runnerFailureSummary = totalRunnerFailures > 0 ? `, ${totalRunnerFailures} runner failures` : "";
  // Format errors are repo-wide, not package-scoped, so the package count can be 0.
  const formatDetail = totalFormatErrors > 0 ? ` (incl. ${totalFormatErrors} unformatted files)` : "";
  const scopeSummary = failedPackages > 0 ? ` across ${failedPackages} packages` : "";
  return `❌ ${totalErrors} errors${formatDetail}, ${totalWarnings} warnings${runnerFailureSummary}${scopeSummary}`;
};

const checkRepo = (): number => {
  const formatResult = runFormatCheck([], process.cwd());

  // Sequential on purpose: parallel runs overwhelm the machine and the tools are fast.
  const results = PACKAGES.filter((pkg) => fs.existsSync(path.join(process.cwd(), pkg.name))).map(checkPackage);
  const allPassed = !formatFailed(formatResult) && results.every((r) => r.lint.success && r.typecheck.success);

  banner(repoHeadline(results, formatResult, allPassed));

  if (formatFailed(formatResult)) {
    reportFormatSection(formatResult);
  }

  // Sample package errors; format issues are listed in full above.
  const totalPackageErrors = results.reduce((sum, r) => sum + r.lint.errors + r.typecheck.errors, 0);
  if (totalPackageErrors > 0) {
    log(`\n📋 Sample errors (first ${MAX_SAMPLE_ERRORS}):\n`);
    const failed = results.filter((r) => !r.lint.success || !r.typecheck.success);
    failed
      .flatMap(sampleErrors)
      .slice(0, MAX_SAMPLE_ERRORS)
      .forEach((lines) => log(...lines));

    if (totalPackageErrors > MAX_SAMPLE_ERRORS) {
      log(`\n  ... and ${totalPackageErrors - MAX_SAMPLE_ERRORS} more errors`);
    }
  }

  log("\nReport files from this run:");
  for (const { lint, typecheck } of results) {
    for (const resultPath of [lint.resultPath, typecheck.resultPath]) {
      if (resultPath) log(`  ${relativeToCwd(resultPath)}`);
    }
  }

  return allPassed ? 0 : 1;
};

/**
 * Pull the JSON object out of oxlint's output. oxlint prefixes its JSON with
 * notices on some paths (e.g. "No files found to lint."), so a bare parse throws.
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

const toLintIssue = (diag: OxlintDiagnostic): LintIssue => {
  const label = diag.labels[0];
  return {
    file: diag.filename,
    line: label?.span.line ?? 1,
    column: label?.span.column ?? 1,
    rule: diag.code,
    message: diag.message,
    severity: diag.severity === "error" ? "error" : "warning",
  };
};

const lintFiles = (pkgPath: string, files: string[], toolFailures: string[]): FileLintResult => {
  const failed: FileLintResult = { errors: 0, warnings: 0, ran: false, issues: [] };
  const configPath = path.resolve(process.cwd(), ".oxlintrc.json");

  // An argument array, not a shell string: word-splitting paths with spaces made oxlint lint nothing.
  const lintRun = spawnSync(localBin("oxlint", pkgPath), ["--config", configPath, "--format=json", ...files], {
    encoding: "utf-8",
    cwd: pkgPath,
  });

  const lintOutput = (lintRun.stdout ?? "") + "\n" + (lintRun.stderr ?? "");
  const lintResult = extractJsonObject(lintOutput);

  if (lintRun.error) {
    toolFailures.push(`oxlint could not be started: ${lintRun.error.message}`);
    return failed;
  }
  if (lintResult === null) {
    toolFailures.push(
      `oxlint produced no parseable JSON (exit code ${lintRun.status ?? "signal " + lintRun.signal}).\n` +
        `    Output: ${firstLines(lintOutput)}`
    );
    return failed;
  }
  if ((lintResult.number_of_files ?? 0) === 0) {
    // A bad path or a file excluded by ignorePatterns; not "no lint issues".
    toolFailures.push(
      `oxlint linted 0 files. The requested paths matched nothing, or every one of\n` +
        `    them is excluded by ignorePatterns in .oxlintrc.json:\n` +
        files.map((f) => `      ${f}`).join("\n")
    );
    return failed;
  }

  const issues = lintResult.diagnostics.map(toLintIssue);
  const errors = issues.filter((issue) => issue.severity === "error").length;
  let ran = true;

  if (lintRun.status !== 0 && errors === 0) {
    ran = false;
    toolFailures.push(
      `oxlint exited ${lintRun.status ?? "with signal " + lintRun.signal} without reporting lint errors.`
    );
  }

  if (lintResult.number_of_files !== undefined && lintResult.number_of_files < files.length) {
    log(
      `\n⚠  oxlint linted ${lintResult.number_of_files} of ${files.length} requested files ` +
        `(the rest are excluded by ignorePatterns).`
    );
  }

  return { errors, warnings: issues.length - errors, ran, issues };
};

const typecheckFiles = (pkgPath: string, files: string[], toolFailures: string[]): FileTypecheckResult => {
  const typecheckRun = spawnSync(localBin("tsgo", pkgPath), ["--noEmit", "--pretty", "false"], {
    encoding: "utf-8",
    cwd: pkgPath,
  });

  if (typecheckRun.error) {
    toolFailures.push(`tsgo could not be started: ${typecheckRun.error.message}`);
    return { errors: 0, ran: false, issues: [] };
  }
  if (typecheckRun.status === 0) {
    return { errors: 0, ran: true, issues: [] };
  }

  const output = (typecheckRun.stdout ?? "") + "\n" + (typecheckRun.stderr ?? "");
  // Project-wide diagnostics tell "real errors elsewhere" apart from "tsgo broke".
  const diagnostics = parseTscOutput(output);
  const targetFiles = new Set(files);
  const issues = diagnostics.filter((d) => targetFiles.has(path.resolve(pkgPath, d.file)));
  const errors = issues.filter((d) => d.severity === "error").length;

  // A bad tsconfig, a crash or an OOM: failed without anything parseable.
  if (diagnostics.length === 0) {
    toolFailures.push(
      `tsgo exited ${typecheckRun.status} without any parseable diagnostics.\n    Output: ${firstLines(output)}`
    );
    return { errors, ran: false, issues };
  }
  return { errors, ran: true, issues };
};

const printLintSection = (lint: FileLintResult): void => {
  printSection("LINT");
  if (!lint.ran) {
    log("❌ oxlint did not complete successfully — see TOOL FAILURES below");
  } else if (lint.issues.length === 0) {
    log("✅ No lint issues");
  } else {
    log(`${lint.errors} errors, ${lint.warnings} warnings`);
    for (const issue of lint.issues) {
      const marker = issue.severity === "error" ? "✗" : "⚠";
      log(`  ${marker} ${issue.file}:${issue.line}:${issue.column}`, `    ${issue.rule}: ${issue.message}`);
    }
  }
};

const printTypecheckSection = (typecheck: FileTypecheckResult): void => {
  printSection("TYPECHECK");
  if (!typecheck.ran) {
    log("❌ tsgo did not run to completion — see TOOL FAILURES below");
  } else if (typecheck.errors === 0) {
    log("✅ No type errors in specified files");
  } else {
    log(`${typecheck.errors} errors`);
    for (const issue of typecheck.issues) {
      log(`  ✗ ${issue.file}:${issue.line}:${issue.column}`, `    ${issue.code}: ${issue.message}`);
    }
  }
};

/** Resolve `<package-dir> <file...>` to absolute paths, or report why not. */
const resolveFileArgs = (args: string[]): { pkgPath: string; files: string[] } | null => {
  if (args.length < 2) {
    logError("Usage: check-ai.ts --files <package-dir> <file1> [file2] ...");
    logError("Example: check-ai.ts --files apps/web lib/services/foo.ts");
    return null;
  }

  const pkgPath = path.resolve(process.cwd(), args[0]!);
  if (!fs.existsSync(pkgPath)) {
    logError(`Package directory not found: ${pkgPath}`);
    return null;
  }

  const files = args.slice(1).map((f) => path.resolve(pkgPath, f));
  const missingFiles = files.filter((f) => !fs.existsSync(f));
  if (missingFiles.length > 0) {
    logError("Files not found:");
    missingFiles.forEach((f) => logError(`  ${relativeToCwd(f)}`));
    return null;
  }
  return { pkgPath, files };
};

const checkFiles = (args: string[]): number => {
  const resolved = resolveFileArgs(args);
  if (!resolved) return 1;
  const { pkgPath, files } = resolved;

  banner(`FILE-SCOPED CHECK: ${files.map(relativeToCwd).join(", ")}`);

  // Tools that crashed, are missing, or ran over zero files. Never a clean result.
  const toolFailures: string[] = [];

  const formatResult = runFormatCheck([], process.cwd());
  if (formatResult.toolError !== undefined) {
    toolFailures.push(formatResult.toolError);
  }

  const lint = lintFiles(
    pkgPath,
    files.map((f) => path.relative(pkgPath, f)),
    toolFailures
  );
  const typecheck = typecheckFiles(pkgPath, files, toolFailures);

  const formatErrors = formatResult.unformatted.length;
  const totalErrors = formatErrors + lint.errors + typecheck.errors + toolFailures.length;

  reportFormatSection(formatResult);
  printLintSection(lint);
  printTypecheckSection(typecheck);

  if (toolFailures.length > 0) {
    printSection("TOOL FAILURES");
    log("A check could not be performed. This is NOT a passing result.");
    toolFailures.forEach((failure) => log(`  ✗ ${failure}`));
  }

  banner(
    totalErrors === 0
      ? "✅ ALL CHECKS PASSED for specified files"
      : `❌ ${totalErrors} errors found (${formatErrors} format, ${lint.errors} lint, ` +
          `${typecheck.errors} typecheck, ${toolFailures.length} tool failures)`,
    true
  );

  return totalErrors > 0 ? 1 : 0;
};

const checkFormat = (paths: string[]): number => {
  const result = runFormatCheck(paths, process.cwd());
  reportFormatSection(result);
  return formatFailed(result) ? 1 : 0;
};

const [mode, ...args] = process.argv.slice(2);
if (mode === "--format") process.exit(checkFormat(args));
else if (mode === "--files") process.exit(checkFiles(args));
else if (mode === undefined) process.exit(checkRepo());
else {
  logError(`Unknown argument: ${mode}. Use --files <pkg> <file...> or --format [path ...].`);
  process.exit(1);
}
