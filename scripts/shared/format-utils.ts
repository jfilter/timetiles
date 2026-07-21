/**
 * Shared utilities for the oxfmt format check.
 *
 * CI runs `oxfmt --check` as its first quality gate, so an unformatted file
 * fails the build before lint, typecheck, or tests ever run. This helper lets
 * the `check-ai` scripts run the same gate locally.
 *
 * @module
 * @category Scripts
 */
import { spawnSync } from "node:child_process";

/**
 * Match the per-file lines oxfmt prints for unformatted files, e.g.
 * `apps/web/lib/foo.ts (8ms)`. The trailing summary line ends in `threads.`
 * and therefore does not match.
 */
const UNFORMATTED_FILE_PATTERN = /^(\S.*?)\s+\(\d+ms\)$/;

/** oxfmt exit code when it ran fine and every file was already formatted. */
const OXFMT_CLEAN = 0;
/** oxfmt exit code when it ran fine and found files needing formatting. */
const OXFMT_ISSUES_FOUND = 1;

/**
 * Outcome of a format check.
 *
 * `toolError` is set when oxfmt itself failed — a missing binary, a bad flag, or
 * a path that matched no files (exit code 2). Callers MUST treat that as a
 * failed gate: an empty `unformatted` list only means "clean" when `toolError`
 * is undefined.
 */
export interface FormatCheckResult {
  unformatted: string[];
  toolError?: string;
}

/**
 * Run `oxfmt --check` over the given paths.
 *
 * @param paths - Paths to check, relative to `cwd`. Defaults to the whole tree.
 * @param cwd - Directory to run oxfmt from. Reported paths are relative to it.
 */
export const runFormatCheck = (paths: string[], cwd: string): FormatCheckResult => {
  const targets = paths.length > 0 ? paths : ["."];

  const run = spawnSync("pnpm", ["exec", "oxfmt", "--check", ...targets], { encoding: "utf-8", cwd });

  if (run.error) {
    return { unformatted: [], toolError: `oxfmt could not be started: ${run.error.message}` };
  }

  const output = (run.stdout ?? "") + "\n" + (run.stderr ?? "");
  const unformatted = output
    .split("\n")
    .map((line) => UNFORMATTED_FILE_PATTERN.exec(line.trim())?.[1])
    .filter((file): file is string => file !== undefined);

  if (run.status === OXFMT_CLEAN) {
    return { unformatted: [] };
  }

  // Exit 1 with a parsed file list is the ordinary "needs formatting" result.
  // Anything else — exit 1 with nothing parsed (bad flag), exit 2 ("Expected at
  // least one target file"), or death by signal — means the gate did not run.
  if (run.status === OXFMT_ISSUES_FOUND && unformatted.length > 0) {
    return { unformatted };
  }

  const detail = output.trim().split("\n").slice(0, 5).join("\n      ") || "(no output)";
  return {
    unformatted,
    toolError:
      `oxfmt exited ${run.status ?? `on signal ${run.signal}`} without reporting any ` +
      `unformatted files, so the format gate did not run.\n      ${detail}`,
  };
};

/**
 * Print the FORMAT section of a check-ai report.
 */
export const reportFormatSection = (result: FormatCheckResult): void => {
  const { unformatted, toolError } = result;
  /* eslint-disable no-console */
  console.log("\n" + "-".repeat(70));
  console.log("FORMAT:");
  console.log("-".repeat(70));
  if (toolError !== undefined) {
    console.log(`❌ Format check FAILED TO RUN — this is not a clean result.\n      ${toolError}`);
    return;
  }
  if (unformatted.length === 0) {
    console.log("✅ No format issues");
    return;
  }
  console.log(`${unformatted.length} unformatted files`);
  for (const file of unformatted) {
    console.log(`  ✗ ${file}`);
  }
  console.log(`\n  Fix with: pnpm exec oxfmt ${unformatted.map((f) => JSON.stringify(f)).join(" ")}`);
  /* eslint-enable no-console */
};
