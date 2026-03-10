#!/usr/bin/env tsx
/**
 * Combined code quality check summary script.
 *
 * Runs oxlint (fast native rules), ESLint (specialized plugins), and
 * TypeScript compiler checks, then displays a unified summary.
 *
 * @module
 * @category Scripts
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

interface LintMessage {
  ruleId: string | null;
  severity: number;
  message: string;
  line: number;
  column: number;
  fix?: { range: [number, number]; text: string };
}

interface LintResult {
  filePath: string;
  messages: LintMessage[];
  errorCount: number;
  warningCount: number;
  fatalErrorCount: number;
  fixableErrorCount: number;
  fixableWarningCount: number;
}

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
  lint: {
    success: boolean;
    errorCount: number;
    warningCount: number;
    fixableCount: number;
    filesWithIssues: number;
    topRules: Array<[string, number]>;
    errors: LintResult[];
  };
  typecheck: { success: boolean; errorCount: number; errors: TypeScriptError[] };
}

const runOxlintCheck = (): OxlintResults => {
  const historyDir = path.join(process.cwd(), ".lint-results");
  fs.mkdirSync(historyDir, { recursive: true });
  const ts = new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\.\d+Z$/, "");
  const resultsPath = path.join(historyDir, `${ts}-oxlint.json`);

  try {
    const output = execSync("pnpm exec oxlint --config ../../.oxlintrc.json . --format json", {
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

const runLintCheck = (): CheckResults["lint"] => {
  const historyDir = path.join(process.cwd(), ".lint-results");
  fs.mkdirSync(historyDir, { recursive: true });
  const ts = new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\.\d+Z$/, "");
  const resultsPath = path.join(historyDir, `${ts}.json`);

  try {
    // Run ESLint with JSON output
    execSync(
      `pnpm exec eslint app lib components tests scripts --ext .ts,.tsx,.js,.jsx --cache --format json --output-file ${resultsPath}`,
      { stdio: "pipe" }
    );
  } catch {
    // ESLint exits with non-zero on errors, that's expected
  }

  if (!fs.existsSync(resultsPath)) {
    return {
      success: false,
      errorCount: 0,
      warningCount: 0,
      fixableCount: 0,
      filesWithIssues: 0,
      topRules: [],
      errors: [],
    };
  }

  const results = JSON.parse(fs.readFileSync(resultsPath, "utf-8")) as LintResult[];

  let totalErrors = 0;
  let totalWarnings = 0;
  let totalFixable = 0;
  let filesWithIssues = 0;
  const ruleViolations = new Map<string, number>();

  results.forEach((file) => {
    if (file.messages.length > 0) {
      filesWithIssues++;
      totalErrors += file.errorCount;
      totalWarnings += file.warningCount;
      totalFixable += file.fixableErrorCount + file.fixableWarningCount;

      file.messages.forEach((msg) => {
        if (msg.ruleId) {
          ruleViolations.set(msg.ruleId, (ruleViolations.get(msg.ruleId) ?? 0) + 1);
        }
      });
    }
  });

  const topRules = Array.from(ruleViolations.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return {
    success: totalErrors === 0,
    errorCount: totalErrors,
    warningCount: totalWarnings,
    fixableCount: totalFixable,
    filesWithIssues,
    topRules,
    errors: results.filter((f) => f.errorCount > 0).slice(0, 10),
  };
};

const runTypeCheck = (): CheckResults["typecheck"] => {
  const errors: TypeScriptError[] = [];
  const tcHistoryDir = path.join(process.cwd(), ".typecheck-results");
  fs.mkdirSync(tcHistoryDir, { recursive: true });
  const tcTs = new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\.\d+Z$/, "");
  const resultsPath = path.join(tcHistoryDir, `${tcTs}.json`);

  try {
    // Run tsc with more verbose output
    execSync("pnpm exec tsc --noEmit --pretty false", { stdio: "pipe" });

    // No errors, save empty results
    const results = { success: true, errorCount: 0, warningCount: 0, errors: [], timestamp: new Date().toISOString() };

    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));

    return { success: true, errorCount: 0, errors: [] };
  } catch (error) {
    // Parse TypeScript output
    const errorWithOutput = error as { stdout?: Buffer | string; stderr?: Buffer | string };
    const output = errorWithOutput.stdout?.toString() ?? "";
    const lines = output.split("\n");

    // Enhanced pattern to catch both errors and warnings
    // eslint-disable-next-line sonarjs/slow-regex, regexp/no-super-linear-backtracking
    const diagnosticPattern = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.*)$/;
    let currentError: TypeScriptError | null = null;
    let warningCount = 0;

    lines.forEach((line) => {
      const match = diagnosticPattern.exec(line);
      if (match?.[1] && match[2] && match[3] && match[4] && match[5] && match[6]) {
        // Save previous error if exists
        if (currentError) {
          errors.push(currentError);
        }

        const severity = match[4] as "error" | "warning";
        if (severity === "warning") {
          warningCount++;
        }

        currentError = {
          file: match[1],
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          code: match[5],
          message: match[6],
          severity,
        };
      } else if (currentError && line.trim() && !/^\s*$/.test(line)) {
        // Continuation of multi-line message
        currentError.message += "\n" + line;
      }
    });

    // Don't forget the last error
    if (currentError) {
      errors.push(currentError);
    }

    // Save all errors to JSON file
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

// Run all checks
const oxlintResults = runOxlintCheck();
const lintResults = runLintCheck();
const typecheckResults = runTypeCheck();

// Overall status
const allPassed = oxlintResults.success && lintResults.success && typecheckResults.success;
const totalWarnings = oxlintResults.warningCount + lintResults.warningCount;

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
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([rule, count]) => {
        console.log(`  ${count}x ${rule}`);
      });
  }
}

// ESLint results
console.log("\n" + "-".repeat(50));
console.log("ESLINT RESULTS:");
console.log("-".repeat(50));

if (lintResults.errorCount === 0 && lintResults.warningCount === 0) {
  console.log("✅ No ESLint issues");
} else {
  console.log(`Files checked: ${lintResults.filesWithIssues} with issues`);
  console.log(`  ✗ Errors: ${lintResults.errorCount}`);
  console.log(`  ⚠ Warnings: ${lintResults.warningCount}`);
  if (lintResults.fixableCount > 0) {
    console.log(`  🔧 Auto-fixable: ${lintResults.fixableCount}`);
  }

  if (lintResults.topRules.length > 0) {
    console.log("\nTop violations:");
    lintResults.topRules.forEach(([rule, count]) => {
      console.log(`  ${count}x ${rule}`);
    });
  }

  if (lintResults.errors.length > 0) {
    console.log("\nFiles with errors (first 3 per file):");
    lintResults.errors.slice(0, 3).forEach((file) => {
      const relPath = path.relative(process.cwd(), file.filePath);
      console.log(`  📁 ${relPath}`);

      file.messages
        .filter((msg) => msg.severity === 2)
        .slice(0, 2)
        .forEach((msg) => {
          const rule = msg.ruleId ? ` (${msg.ruleId})` : "";
          console.log(`     Line ${msg.line}:${msg.column} - ${msg.message.substring(0, 60)}...${rule}`);
        });
    });

    if (lintResults.errors.length > 3) {
      console.log(`  ... and ${lintResults.errors.length - 3} more files`);
    }
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
console.log(`  ESLint: ${lintResults.errorCount} errors, ${lintResults.warningCount} warnings`);
console.log(`  TypeScript: ${typecheckResults.errorCount} errors`);
if (lintResults.fixableCount > 0) {
  console.log(`\n💡 Run 'pnpm format' to auto-fix ${lintResults.fixableCount} issues`);
}
console.log("\nResults saved to:");
console.log("  .lint-results/");
console.log("  .typecheck-results/");
console.log("=".repeat(50) + "\n");

// Exit with appropriate code
const hasErrors = oxlintResults.errorCount > 0 || lintResults.errorCount > 0 || typecheckResults.errorCount > 0;
process.exit(hasErrors ? 1 : 0);
