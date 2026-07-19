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
import { execSync } from "node:child_process";

/**
 * Match the per-file lines oxfmt prints for unformatted files, e.g.
 * `apps/web/lib/foo.ts (8ms)`. The trailing summary line ends in `threads.`
 * and therefore does not match.
 */
const UNFORMATTED_FILE_PATTERN = /^(\S.*?)\s+\(\d+ms\)$/;

/**
 * Run `oxfmt --check` over the given paths and return the unformatted files.
 *
 * @param paths - Paths to check, relative to `cwd`. Defaults to the whole tree.
 * @param cwd - Directory to run oxfmt from. Reported paths are relative to it.
 */
export const runFormatCheck = (paths: string[], cwd: string): string[] => {
  const targets = paths.length > 0 ? paths : ["."];
  let output = "";

  try {
    output = execSync(`pnpm exec oxfmt --check ${targets.map((p) => JSON.stringify(p)).join(" ")} 2>&1`, {
      encoding: "utf-8",
      cwd,
    });
  } catch (error) {
    // oxfmt exits non-zero when files need formatting — the file list is on stdout.
    const errorWithOutput = error as { stdout?: string | Buffer };
    output = errorWithOutput.stdout?.toString() ?? "";
  }

  return output
    .split("\n")
    .map((line) => UNFORMATTED_FILE_PATTERN.exec(line.trim())?.[1])
    .filter((file): file is string => file !== undefined);
};

/**
 * Print the FORMAT section of a check-ai report.
 */
export const reportFormatSection = (unformatted: string[]): void => {
  /* eslint-disable no-console */
  console.log("\n" + "-".repeat(70));
  console.log("FORMAT:");
  console.log("-".repeat(70));
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
