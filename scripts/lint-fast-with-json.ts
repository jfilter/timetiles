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

import { createTimestamp, pruneOldResults } from "./shared/typecheck-utils";

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

/** Transform oxlint diagnostics into ESLint-compatible results grouped by file. */
const transformOxlintToEslint = (diagnostics: OxlintDiagnostic[]): ESLintFileResult[] => {
  const fileMap = new Map<string, ESLintMessage[]>();

  for (const diag of diagnostics) {
    const filePath = path.resolve(diag.filename);
    if (!fileMap.has(filePath)) {
      fileMap.set(filePath, []);
    }

    const label = diag.labels[0];
    fileMap
      .get(filePath)!
      .push({
        ruleId: diag.code,
        severity: diag.severity === "error" ? 2 : 1,
        message: diag.message,
        line: label?.span.line ?? 1,
        column: label?.span.column ?? 1,
      });
  }

  const results: ESLintFileResult[] = [];
  for (const [filePath, messages] of fileMap) {
    results.push({
      filePath,
      errorCount: messages.filter((m) => m.severity === 2).length,
      warningCount: messages.filter((m) => m.severity === 1).length,
      messages,
    });
  }
  return results;
};

const configPath = path.resolve(__dirname, "../.oxlintrc.json");

const historyDir = path.join(process.cwd(), ".lint-results");
fs.mkdirSync(historyDir, { recursive: true });
const resultsPath = path.join(historyDir, `${createTimestamp()}.json`);

const writeResults = (results: ESLintFileResult[]): number => {
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  pruneOldResults(historyDir);

  return results.reduce((sum, result) => sum + result.errorCount, 0);
};

const createConfigErrorResults = (message: string): ESLintFileResult[] => [
  {
    filePath: configPath,
    errorCount: 1,
    warningCount: 0,
    messages: [
      {
        ruleId: "oxlint/config-error",
        severity: 2,
        message: message.trim() || "oxlint failed before producing JSON output.",
        line: 1,
        column: 1,
      },
    ],
  },
];

let exitCode = 0;

try {
  const output = execSync(`pnpm exec oxlint --config ${configPath} --format=json . 2>&1`, { encoding: "utf-8" });
  const oxlintResult: OxlintOutput = JSON.parse(output);
  const eslintResults = transformOxlintToEslint(oxlintResult.diagnostics);
  const totalErrors = writeResults(eslintResults);
  exitCode = totalErrors > 0 ? 1 : 0;
} catch (error) {
  const errorWithOutput = error as { stdout?: string | Buffer; stderr?: string | Buffer };
  const stdout = errorWithOutput.stdout?.toString() ?? "";
  const stderr = errorWithOutput.stderr?.toString() ?? "";
  const commandOutput = [stdout, stderr].filter(Boolean).join("\n").trim();

  try {
    const oxlintResult: OxlintOutput = JSON.parse(stdout || commandOutput);
    const eslintResults = transformOxlintToEslint(oxlintResult.diagnostics);
    const totalErrors = writeResults(eslintResults);
    exitCode = totalErrors > 0 ? 1 : 0;
  } catch {
    writeResults(createConfigErrorResults(commandOutput));
    exitCode = 1;
  }
}

process.exit(exitCode);
