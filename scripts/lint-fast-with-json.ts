#!/usr/bin/env tsx
/**
 * Wrapper to run oxlint and generate ESLint-compatible JSON results for check-ai.
 *
 * @module
 * @category Scripts
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

interface OxlintDiagnostic {
  message: string;
  code: string;
  severity: "error" | "warning";
  filename: string;
  labels: Array<{
    span: {
      offset: number;
      length: number;
      line: number;
      column: number;
    };
  }>;
}

interface OxlintOutput {
  diagnostics: OxlintDiagnostic[];
}

interface ESLintMessage {
  ruleId: string | null;
  severity: number; // 1 = warning, 2 = error
  message: string;
  line: number;
  column: number;
}

interface ESLintFileResult {
  filePath: string;
  errorCount: number;
  warningCount: number;
  messages: ESLintMessage[];
}

const configPath = path.resolve(__dirname, "../.oxlintrc.json");

try {
  const output = execSync(`pnpm exec oxlint --config ${configPath} --format=json . 2>&1`, {
    encoding: "utf-8",
  });

  // Parse oxlint JSON output
  const oxlintResult: OxlintOutput = JSON.parse(output);

  // Group diagnostics by file
  const fileMap = new Map<string, ESLintMessage[]>();

  for (const diag of oxlintResult.diagnostics) {
    const filePath = path.resolve(diag.filename);
    if (!fileMap.has(filePath)) {
      fileMap.set(filePath, []);
    }

    const label = diag.labels[0];
    fileMap.get(filePath)!.push({
      ruleId: diag.code,
      severity: diag.severity === "error" ? 2 : 1,
      message: diag.message,
      line: label?.span.line ?? 1,
      column: label?.span.column ?? 1,
    });
  }

  // Convert to ESLint format
  const eslintResults: ESLintFileResult[] = [];
  for (const [filePath, messages] of fileMap) {
    eslintResults.push({
      filePath,
      errorCount: messages.filter((m) => m.severity === 2).length,
      warningCount: messages.filter((m) => m.severity === 1).length,
      messages,
    });
  }

  fs.writeFileSync(".lint-results.json", JSON.stringify(eslintResults, null, 2));

  // Exit with error if there are any errors
  const totalErrors = eslintResults.reduce((sum, r) => sum + r.errorCount, 0);
  if (totalErrors > 0) {
    process.exit(1);
  }
} catch (error) {
  const errorWithOutput = error as { stdout?: string | Buffer; stderr?: string | Buffer };
  const stdout = errorWithOutput.stdout?.toString() ?? "";

  try {
    // Try to parse JSON even on error exit
    const oxlintResult: OxlintOutput = JSON.parse(stdout);

    const fileMap = new Map<string, ESLintMessage[]>();

    for (const diag of oxlintResult.diagnostics) {
      const filePath = path.resolve(diag.filename);
      if (!fileMap.has(filePath)) {
        fileMap.set(filePath, []);
      }

      const label = diag.labels[0];
      fileMap.get(filePath)!.push({
        ruleId: diag.code,
        severity: diag.severity === "error" ? 2 : 1,
        message: diag.message,
        line: label?.span.line ?? 1,
        column: label?.span.column ?? 1,
      });
    }

    const eslintResults: ESLintFileResult[] = [];
    for (const [filePath, messages] of fileMap) {
      eslintResults.push({
        filePath,
        errorCount: messages.filter((m) => m.severity === 2).length,
        warningCount: messages.filter((m) => m.severity === 1).length,
        messages,
      });
    }

    fs.writeFileSync(".lint-results.json", JSON.stringify(eslintResults, null, 2));

    const totalErrors = eslintResults.reduce((sum, r) => sum + r.errorCount, 0);
    if (totalErrors > 0) {
      process.exit(1);
    }
  } catch {
    // If we can't parse, write empty results
    fs.writeFileSync(".lint-results.json", JSON.stringify([], null, 2));
    process.exit(1);
  }
}
