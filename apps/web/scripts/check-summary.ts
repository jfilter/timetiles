#!/usr/bin/env tsx
/**
 * Combined code quality check summary script.
 *
 * Runs oxlint and TypeScript compiler checks, then displays a unified summary.
 *
 * @module
 * @category Scripts
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { localBin } from "../../../scripts/shared/local-bin";
import { parseTscOutput } from "../../../scripts/shared/typecheck-utils";

interface TypeScriptError {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
  category?: string;
  severity: "error" | "warning";
}

interface OxlintDiagnostic {
  message: string;
  code: string;
  severity: string;
  filename: string;
  labels: Array<{ span: { line: number; column: number } }>;
}

interface OxlintOutput {
  diagnostics: OxlintDiagnostic[];
  number_of_files: number;
  number_of_rules: number;
}

interface OxlintResults {
  success: boolean;
  errorCount: number;
  warningCount: number;
  filesChecked: number;
  rulesChecked: number;
  diagnostics: OxlintDiagnostic[];
}

interface CheckResults {
  oxlint: OxlintResults;
  typecheck: { success: boolean; errorCount: number; errors: TypeScriptError[] };
}

const runOxlintCheck = (): OxlintResults => {
  const historyDir = path.join(process.cwd(), ".lint-results");
  fs.mkdirSync(historyDir, { recursive: true });
  const ts = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d+Z$/, "");
  const resultsPath = path.join(historyDir, `${ts}-oxlint.json`);

  try {
    const output = execFileSync(localBin("oxlint"), ["--config", "../../.oxlintrc.json", ".", "--format", "json"], {
      stdio: "pipe",
      encoding: "utf-8",
    });
    const parsed = JSON.parse(output) as OxlintOutput;
    fs.writeFileSync(resultsPath, JSON.stringify(parsed, null, 2));

    const errors = parsed.diagnostics.filter((d) => d.severity === "error");
    const warnings = parsed.diagnostics.filter((d) => d.severity === "warning");

    return {
      success: errors.length === 0,
      errorCount: errors.length,
      warningCount: warnings.length,
      filesChecked: parsed.number_of_files,
      rulesChecked: parsed.number_of_rules,
      diagnostics: parsed.diagnostics,
    };
  } catch (error) {
    const errorWithOutput = error as { stdout?: string; status?: number };
    try {
      const parsed = JSON.parse(errorWithOutput.stdout ?? "{}") as OxlintOutput;
      fs.writeFileSync(resultsPath, JSON.stringify(parsed, null, 2));

      const errors = parsed.diagnostics.filter((d) => d.severity === "error");
      const warnings = parsed.diagnostics.filter((d) => d.severity === "warning");

      return {
        success: errors.length === 0,
        errorCount: errors.length,
        warningCount: warnings.length,
        filesChecked: parsed.number_of_files,
        rulesChecked: parsed.number_of_rules,
        diagnostics: parsed.diagnostics,
      };
    } catch {
      return { success: false, errorCount: 1, warningCount: 0, filesChecked: 0, rulesChecked: 0, diagnostics: [] };
    }
  }
};

const runTypeCheck = (): CheckResults["typecheck"] => {
  const errors: TypeScriptError[] = [];
  const tcHistoryDir = path.join(process.cwd(), ".typecheck-results");
  fs.mkdirSync(tcHistoryDir, { recursive: true });
  const tcTs = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d+Z$/, "");
  const resultsPath = path.join(tcHistoryDir, `${tcTs}.json`);

  try {
    // Run tsgo with machine-readable output and parse the diagnostics below.
    execFileSync(localBin("tsgo"), ["--noEmit", "--pretty", "false"], { stdio: "pipe" });

    // No errors, save empty results
    const results = { success: true, errorCount: 0, warningCount: 0, errors: [], timestamp: new Date().toISOString() };

    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));

    return { success: true, errorCount: 0, errors: [] };
  } catch (error) {
    const errorWithOutput = error as { stdout?: Buffer | string; stderr?: Buffer | string };
    const output = errorWithOutput.stdout?.toString() ?? "";
    errors.push(...parseTscOutput(output, "raw"));
    const warningCount = errors.filter((e) => e.severity === "warning").length;

    const results = {
      success: false,
      errorCount: errors.filter((e) => e.severity === "error").length,
      warningCount,
      errors: errors,
      files: [...new Set(errors.map((e) => e.file))],
      timestamp: new Date().toISOString(),
      summary: {
        byCode: errors.reduce(
          (acc, err) => {
            acc[err.code] = (acc[err.code] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        ),
        byFile: errors.reduce(
          (acc, err) => {
            acc[err.file] = (acc[err.file] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        ),
      },
    };

    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));

    return {
      success: false,
      errorCount: results.errorCount,
      errors: errors.slice(0, 10), // Still limit display to first 10
    };
  }
};

// Main execution
console.log("\n" + "=".repeat(50));
console.log("CODE QUALITY CHECK SUMMARY");
console.log("=".repeat(50));

console.log("\n📋 Running checks...");

const oxlintResults = runOxlintCheck();
const typecheckResults = runTypeCheck();

// Overall status
const allPassed = oxlintResults.success && typecheckResults.success;
const totalWarnings = oxlintResults.warningCount;

if (allPassed && totalWarnings === 0) {
  console.log("\n✅ ALL CHECKS PASSED - NO ISSUES FOUND");
} else if (allPassed) {
  console.log("\n⚠️  NO ERRORS (but warnings found)");
} else {
  console.log("\n❌ CHECKS FAILED");
}

// oxlint results
console.log("\n" + "-".repeat(50));
console.log(`OXLINT (${oxlintResults.filesChecked} files, ${oxlintResults.rulesChecked} rules):`);
console.log("-".repeat(50));

if (oxlintResults.errorCount === 0 && oxlintResults.warningCount === 0) {
  console.log("✅ No oxlint issues");
} else {
  console.log(`  ✗ Errors: ${oxlintResults.errorCount}`);
  console.log(`  ⚠ Warnings: ${oxlintResults.warningCount}`);

  if (oxlintResults.diagnostics.length > 0) {
    const ruleCount = new Map<string, number>();
    oxlintResults.diagnostics.forEach((d) => {
      ruleCount.set(d.code, (ruleCount.get(d.code) ?? 0) + 1);
    });
    console.log("\nTop violations:");
    Array.from(ruleCount.entries())
      .toSorted((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([rule, count]) => {
        console.log(`  ${count}x ${rule}`);
      });
  }
}

// TypeScript results
console.log("\n" + "-".repeat(50));
console.log("TYPESCRIPT RESULTS:");
console.log("-".repeat(50));

if (typecheckResults.success) {
  console.log("✅ No type errors");
} else {
  console.log(`Type errors: ${typecheckResults.errorCount}`);

  if (typecheckResults.errors.length > 0) {
    console.log("\nType errors (first 5):");
    typecheckResults.errors.slice(0, 5).forEach((error) => {
      const relPath = path.relative(process.cwd(), error.file);
      console.log(`  📁 ${relPath}:${error.line}:${error.column}`);
      console.log(`     ${error.code}: ${error.message.substring(0, 70)}...`);
    });

    if (typecheckResults.errorCount > 5) {
      console.log(`  ... and ${typecheckResults.errorCount - 5} more errors`);
    }
  }
}

// Summary
console.log("\n" + "=".repeat(50));
console.log("SUMMARY:");
console.log(`  oxlint: ${oxlintResults.errorCount} errors, ${oxlintResults.warningCount} warnings`);
console.log(`  TypeScript: ${typecheckResults.errorCount} errors`);
console.log("\nResults saved to:");
console.log("  .lint-results/");
console.log("  .typecheck-results/");
console.log("=".repeat(50) + "\n");

// Exit with appropriate code
const hasErrors = oxlintResults.errorCount > 0 || typecheckResults.errorCount > 0;
process.exit(hasErrors ? 1 : 0);
