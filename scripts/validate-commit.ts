#!/usr/bin/env tsx

/**
 * Commit message validation helper
 *
 * Usage:
 *   tsx scripts/validate-commit.ts "fix(config): some message"
 *   tsx scripts/validate-commit.ts --test
 *   tsx scripts/validate-commit.ts --files .github/workflows/ci.yml
 */

import chalk from "chalk";
import { execSync } from "child_process";

interface ParsedCommit {
  type: string | null;
  scope: string | null;
  subject: string;
  raw?: string;
}

interface ValidationError {
  rule: string;
  message: string;
}

interface ValidationResult {
  parsed: ParsedCommit;
  errors: ValidationError[];
  warnings: ValidationError[];
  suggestions: string[];
}

interface TestCase {
  name: string;
  message: string;
  files: string[];
  expectError: boolean;
  expectedSuggestion?: string;
}

// Rule name constants to avoid duplicate strings
const RULE_SCOPE_FILE_MATCH = "scope-file-match";
const RULE_TYPE_SCOPE_COMBINATION = "type-scope-combination";

// Valid types and scopes
const VALID_TYPES = [
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
  "security",
  "format",
];

const VALID_SCOPES = [
  "web",
  "docs",
  "ui",
  "assets",
  "config",
  "import",
  "geocoding",
  "events",
  "schema",
  "deploy",
  "db",
  "api",
  "jobs",
  "deps",
  "seed",
  "test",
  "ci",
  "build",
  "infra",
];

// Map file paths to expected scopes based on monorepo structure.
// More specific patterns must come before general ones when order matters.
const SCOPE_MAP: Record<string, string> = {
  // CI/CD and infrastructure
  ".github/": "ci",
  ".circleci/": "ci",
  Dockerfile: "build",
  "docker-compose": "build",
  ".dockerignore": "build",

  // Root configuration files
  "package.json": "deps",
  "pnpm-lock.yaml": "deps",
  "turbo.json": "build",
  "commitlint.config": "build",
  ".gitignore": "build",
  ".gitattributes": "build",
  Makefile: "build",

  // Apps
  "apps/web/": "web",
  "apps/docs/": "docs",

  // Packages
  "packages/ui/": "ui",
  "packages/assets/": "assets",
  "packages/eslint-config/": "config",
  "packages/typescript-config/": "config",

  // Web app specific paths
  "apps/web/app/api/import/": "import",
  "apps/web/app/api/events/": "events",
  "apps/web/lib/services/geocoding": "geocoding",
  "apps/web/lib/collections/events": "events",
  "apps/web/lib/collections/datasets": "schema",
  "apps/web/lib/collections/import": "import",
  "apps/web/lib/collections/scheduled-imports": "import",
  "apps/web/lib/jobs/": "jobs",
  "apps/web/migrations/": "db",
  "apps/web/lib/seed/": "seed",
  "apps/web/tests/": "test",
  "apps/web/app/api/": "api",

  // Documentation
  "README.md": "docs",
  "CLAUDE.md": "docs",
  "*.md": "docs",
  "*.mdx": "docs",
};

// Get the list of files changed in the commit
function getChangedFiles(): string[] {
  try {
    // For staged changes (during commit)
    const staged = execSync("git diff --cached --name-only", { encoding: "utf8" }).trim().split("\n").filter(Boolean);

    if (staged.length > 0) {
      return staged;
    }

    // For last commit (when validating existing commits)
    return execSync("git diff HEAD~1 --name-only", { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  } catch {
    // Expected when running outside a git repo or with no commit history
    return [];
  }
}

/** Check whether a single file matches a scope map pattern. */
function matchFileToScope(file: string, pattern: string): boolean {
  if (pattern.endsWith("/")) {
    return file.startsWith(pattern);
  }
  if (pattern.startsWith("*.")) {
    return file.endsWith(pattern.slice(1));
  }
  return file.includes(pattern);
}

/** Infer scope from a file's top-level monorepo directory. */
function inferScopeFromPath(file: string): string | null {
  const parts = file.split("/");

  if (parts[0] === "apps" && parts[1]) {
    return parts[1]; // e.g., 'web' or 'docs'
  }

  if (parts[0] === "packages" && parts[1]) {
    return parts[1].includes("config") ? "config" : parts[1];
  }

  return null;
}

// Map file paths to expected scopes based on monorepo structure
function getExpectedScopes(files: string[]): string[] {
  const detectedScopes = new Set<string>();

  for (const file of files) {
    let scopeFound = false;

    // Check exact matches and prefixes
    for (const [pattern, scope] of Object.entries(SCOPE_MAP)) {
      if (matchFileToScope(file, pattern)) {
        detectedScopes.add(scope);
        scopeFound = true;
        break;
      }
    }

    // If no specific scope found, try to infer from top-level directory
    if (!scopeFound) {
      const inferred = inferScopeFromPath(file);
      if (inferred) {
        detectedScopes.add(inferred);
      }
    }
  }

  return Array.from(detectedScopes);
}

// Helper to simulate git diff output for testing
function simulateGitDiff(files: string[]): void {
  const original = execSync.bind(global);
  (global as any).execSync = (cmd: string, opts: any) => {
    if (cmd.includes("git diff")) {
      return files.join("\n");
    }
    return original(cmd, opts);
  };
}

/** Return true if the string contains only word characters (alphanumeric + underscore). */
function isWord(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const isWordChar =
      (c >= 48 && c <= 57) || // 0-9
      (c >= 65 && c <= 90) || // A-Z
      (c >= 97 && c <= 122) || // a-z
      c === 95; // _
    if (!isWordChar) {
      return false;
    }
  }
  return s.length > 0;
}

/**
 * Parse a commit message string into its type, scope, and subject parts.
 * Uses string operations instead of regex to avoid unsafe-regex warnings.
 * Expected format: type(scope): subject  OR  type: subject
 */
function parseCommitMessage(message: string): ParsedCommit {
  // Find the colon-space separator that divides type/scope from subject
  const colonIndex = message.indexOf(": ");
  if (colonIndex === -1) {
    return { type: null, scope: null, subject: message, raw: message };
  }

  const prefix = message.slice(0, colonIndex);
  const subject = message.slice(colonIndex + 2);

  // Check for scope in parentheses: type(scope)
  const parenOpen = prefix.indexOf("(");
  const parenClose = prefix.indexOf(")");

  if (parenOpen !== -1 && parenClose !== -1 && parenClose > parenOpen) {
    const type = prefix.slice(0, parenOpen);
    const scope = prefix.slice(parenOpen + 1, parenClose);

    if (!isWord(type)) {
      return { type: null, scope: null, subject: message, raw: message };
    }

    return { type, scope: scope || null, subject, raw: message };
  }

  // No scope: type: subject
  if (!isWord(prefix)) {
    return { type: null, scope: null, subject: message, raw: message };
  }

  return { type: prefix, scope: null, subject, raw: message };
}

// --- Validation sub-functions ---

function validateType(parsed: ParsedCommit, errors: ValidationError[]): void {
  if (!parsed.type) {
    errors.push({ rule: "type-empty", message: "Type is required" });
  } else if (!VALID_TYPES.includes(parsed.type)) {
    errors.push({
      rule: "type-enum",
      message: `Type "${parsed.type}" is not allowed. Use one of: ${VALID_TYPES.join(", ")}`,
    });
  }
}

function validateScope(parsed: ParsedCommit, errors: ValidationError[]): void {
  if (parsed.scope && !VALID_SCOPES.includes(parsed.scope)) {
    errors.push({
      rule: "scope-enum",
      message: `Scope "${parsed.scope}" is not allowed. Use one of: ${VALID_SCOPES.join(", ")}`,
    });
  }
}

function validateScopeFileMatch(
  parsed: ParsedCommit,
  changedFiles: string[],
  errors: ValidationError[],
  warnings: ValidationError[],
  suggestions: string[]
): void {
  if (changedFiles.length === 0) {
    return;
  }

  const expectedScopes = getExpectedScopes(changedFiles);

  if (!parsed.scope && expectedScopes.length > 0) {
    errors.push({
      rule: RULE_SCOPE_FILE_MATCH,
      message: `Missing scope. Based on changed files, consider using: ${expectedScopes.join(", ")}`,
    });
    suggestions.push(`Try: ${parsed.type}(${expectedScopes[0]}): ${parsed.subject}`);
    return;
  }

  if (!parsed.scope || expectedScopes.length === 0 || expectedScopes.includes(parsed.scope)) {
    return;
  }

  // Special case: 'config' scope should only be used for package configs
  if (parsed.scope === "config") {
    const configFiles = changedFiles.filter((f) => f.includes("packages/") && f.includes("config/"));
    if (configFiles.length === 0) {
      errors.push({
        rule: RULE_SCOPE_FILE_MATCH,
        message: `Scope "config" should only be used for package configuration changes. Based on your changes, consider: ${expectedScopes.join(", ")}`,
      });
    }
  } else if (VALID_SCOPES.includes(parsed.scope)) {
    warnings.push({
      rule: RULE_SCOPE_FILE_MATCH,
      message: `Scope "${parsed.scope}" might not match your changes. Consider using "${expectedScopes[0]}" based on the files modified`,
    });
  }
}

function validateTypeScopeCombination(parsed: ParsedCommit, changedFiles: string[], errors: ValidationError[]): void {
  if (!parsed.type || !parsed.scope) {
    return;
  }

  validateRedundantTypeScopePairs(parsed, errors);

  if (changedFiles.length > 0) {
    validateTypeScopeAgainstFiles(parsed, changedFiles, errors);
  }
}

/** Flag type(scope) pairs where type === scope and the combination is redundant. */
function validateRedundantTypeScopePairs(parsed: ParsedCommit, errors: ValidationError[]): void {
  // Prevent redundant type(scope) combinations where type === scope
  // BUT allow docs(docs) which is valid for documentation app changes
  const redundantCombinations: Record<string, string> = {
    ci: 'Use "ci:" for CI/CD changes, not "ci(ci)"',
    test: 'Use "test(web):" or "test(docs):" to specify which app\'s tests',
    build: 'Use "build:" for build system changes, not "build(build)"',
  };

  if (parsed.type === parsed.scope && redundantCombinations[parsed.type]) {
    errors.push({
      rule: RULE_TYPE_SCOPE_COMBINATION,
      message: redundantCombinations[parsed.type],
    });
  }
}

/** Check file-based type+scope validation rules. */
function validateTypeScopeAgainstFiles(parsed: ParsedCommit, changedFiles: string[], errors: ValidationError[]): void {
  const hasCiFiles = changedFiles.some((f) => f.includes(".github/") || f.includes("ci/"));

  // CI changes should use 'ci' scope when dealing with CI files
  if (parsed.scope === "config" && hasCiFiles && (parsed.type === "fix" || parsed.type === "chore")) {
    const verb = parsed.type === "fix" ? "fixes" : "updates";
    errors.push({
      rule: RULE_TYPE_SCOPE_COMBINATION,
      message: `For CI/build configuration ${verb}, use "${parsed.type}(ci)" or "${parsed.type}(build)" instead of "${parsed.type}(config)"`,
    });
  }

  // Config scope should only be used for package configurations
  if (parsed.scope === "config" && !changedFiles.some((f) => f.includes("packages/") && f.includes("config"))) {
    errors.push({
      rule: RULE_TYPE_SCOPE_COMBINATION,
      message: 'Scope "config" should only be used for configuration package changes (packages/*-config/)',
    });
  }

  // Dependencies should use deps scope
  if (parsed.type === "chore" && parsed.scope === "web" && changedFiles.some((f) => f.endsWith("package.json"))) {
    errors.push({
      rule: RULE_TYPE_SCOPE_COMBINATION,
      message: 'For dependency updates, use "chore(deps)" instead of "chore(web)"',
    });
  }

  // Test changes should typically use 'test' type
  if (parsed.type === "fix" && parsed.scope === "test") {
    errors.push({
      rule: RULE_TYPE_SCOPE_COMBINATION,
      message: 'For test fixes, use "test(web)" or "test(docs)" instead of "fix(test)"',
    });
  }
}

function validateSubject(parsed: ParsedCommit, errors: ValidationError[], warnings: ValidationError[]): void {
  if (!parsed.subject || parsed.subject.trim().length === 0) {
    errors.push({ rule: "subject-empty", message: "Subject is required" });
  } else if (parsed.subject.length < 10) {
    errors.push({ rule: "subject-min-length", message: "Subject must be at least 10 characters" });
  }

  // Check for vague terms
  const vagueTerms = ["stuff", "things", "updates", "changes", "fixes"];
  const lowerSubject = parsed.subject.toLowerCase();
  for (const term of vagueTerms) {
    if (lowerSubject.includes(term)) {
      warnings.push({
        rule: "no-vague-subjects",
        message: `Avoid vague terms like "${term}" in commit subjects`,
      });
    }
  }
}

// Validate commit message
async function validateCommit(message: string, files: string[] = []): Promise<ValidationResult> {
  if (files.length > 0) {
    simulateGitDiff(files);
  }

  const parsed = parseCommitMessage(message);
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const suggestions: string[] = [];

  const changedFiles = files.length > 0 ? files : getChangedFiles();

  validateType(parsed, errors);
  validateScope(parsed, errors);
  validateScopeFileMatch(parsed, changedFiles, errors, warnings, suggestions);
  validateTypeScopeCombination(parsed, changedFiles, errors);
  validateSubject(parsed, errors, warnings);

  return { parsed, errors, warnings, suggestions };
}

// --- Test runner ---

/** Report the result of a single test case and return whether it passed. */
function reportTestCase(test: TestCase, result: ValidationResult): boolean {
  const hasErrors = result.errors.length > 0;

  if (test.expectError !== hasErrors) {
    console.log(chalk.red("✗"), test.name);
    console.log(
      chalk.gray(`  Expected ${test.expectError ? "error" : "success"}, got ${hasErrors ? "error" : "success"}`)
    );
    if (result.errors.length > 0) {
      result.errors.forEach((e) => console.log(chalk.gray(`  - ${e.message}`)));
    }
    return false;
  }

  console.log(chalk.green("✓"), test.name);
  if (test.expectedSuggestion && result.suggestions.length > 0) {
    const suggestedScope = result.suggestions[0].match(/\(([^)]+)\)/)?.[1];
    if (suggestedScope === test.expectedSuggestion) {
      console.log(chalk.gray(`  Correctly suggested scope: ${test.expectedSuggestion}`));
    }
  }
  return true;
}

// Test cases
async function runTests(): Promise<boolean> {
  const testCases: TestCase[] = [
    {
      name: "CI config change with wrong scope",
      message: "fix(config): update CI workflow",
      files: [".github/workflows/ci.yml"],
      expectError: true,
      expectedSuggestion: "ci",
    },
    {
      name: "Package config change with correct scope",
      message: "chore(config): update ESLint rules",
      files: ["packages/eslint-config/base.js"],
      expectError: false,
    },
    {
      name: "Web app change with correct scope",
      message: "feat(web): add new dashboard",
      files: ["apps/web/app/dashboard/page.tsx"],
      expectError: false,
    },
    {
      name: "Import feature change",
      message: "fix(import): handle CSV parsing edge case",
      files: ["apps/web/app/api/import/upload/route.ts"],
      expectError: false,
    },
    {
      name: "Database migration",
      message: "feat(db): add new events table index",
      files: ["apps/web/migrations/20250825_add_index.ts"],
      expectError: false,
    },
    {
      name: "Dependency update",
      message: "chore(deps): update Next.js to v15",
      files: ["apps/web/package.json", "pnpm-lock.yaml"],
      expectError: false,
    },
    {
      name: "Mixed changes with suggested scope",
      message: "refactor: improve code structure",
      files: ["apps/web/lib/services/geocoding.ts"],
      expectError: true,
      expectedSuggestion: "geocoding",
    },
    {
      name: "Root config changes should use build scope",
      message: "chore(build): update commitlint config",
      files: ["commitlint.config.mjs"],
      expectError: false,
    },
    {
      name: "CI changes with correct scope",
      message: "fix(ci): update GitHub Actions workflow",
      files: [".github/workflows/ci.yml"],
      expectError: false,
    },
  ];

  console.log(chalk.bold("\n🧪 Running commit message validation tests:\n"));

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    const result = await validateCommit(test.message, test.files);
    if (reportTestCase(test, result)) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log(chalk.bold(`\n📊 Results: ${passed} passed, ${failed} failed\n`));
  return failed === 0;
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--test") {
    const success = await runTests();
    process.exit(success ? 0 : 1);
  }

  if (args[0] === "--help" || args.length === 0) {
    console.log(chalk.bold("Commit Message Validator\n"));
    console.log("Usage:");
    console.log('  tsx scripts/validate-commit.ts "commit message"');
    console.log('  tsx scripts/validate-commit.ts --files file1 file2 "commit message"');
    console.log("  tsx scripts/validate-commit.ts --test");
    console.log("\nExamples:");
    console.log('  tsx scripts/validate-commit.ts "feat(web): add new feature"');
    console.log('  tsx scripts/validate-commit.ts --files .github/workflows/ci.yml "fix(ci): update workflow"');
    process.exit(0);
  }

  const message = args[args.length - 1];
  let files: string[] = [];

  if (args[0] === "--files") {
    files = args.slice(1, -1);
  }

  const result = await validateCommit(message, files);

  console.log(chalk.bold("\n📝 Commit Message Analysis\n"));
  console.log("Message:", chalk.cyan(message));
  console.log("Parsed:");
  console.log("  Type:", result.parsed.type ?? chalk.gray("none"));
  console.log("  Scope:", result.parsed.scope ?? chalk.gray("none"));
  console.log("  Subject:", result.parsed.subject);

  if (files.length > 0) {
    console.log("\nFiles:", files.join(", "));
  }

  if (result.errors.length > 0) {
    console.log(chalk.red("\n❌ Errors:"));
    result.errors.forEach((e) => {
      console.log(chalk.red(`  • [${e.rule}]`), e.message);
    });
  }

  if (result.warnings.length > 0) {
    console.log(chalk.yellow("\n⚠️  Warnings:"));
    result.warnings.forEach((w) => {
      console.log(chalk.yellow(`  • [${w.rule}]`), w.message);
    });
  }

  if (result.suggestions.length > 0) {
    console.log(chalk.blue("\n💡 Suggestions:"));
    result.suggestions.forEach((s) => {
      console.log(chalk.blue("  •"), s);
    });
  }

  if (result.errors.length === 0 && result.warnings.length === 0) {
    console.log(chalk.green("\n✅ Commit message is valid!"));
  }

  process.exit(result.errors.length > 0 ? 1 : 0);
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
