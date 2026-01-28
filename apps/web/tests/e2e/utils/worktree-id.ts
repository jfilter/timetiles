/**
 * Worktree identification utilities for E2E test isolation.
 *
 * Generates unique identifiers based on git worktree paths to enable
 * simultaneous E2E test runs across multiple worktrees without conflicts.
 *
 * @module
 * @category E2E Utils
 */

import { execSync } from "child_process";
import { createHash } from "crypto";

/**
 * Get a short unique ID for the current git worktree.
 * Returns empty string in CI (no worktree isolation needed).
 *
 * @returns Short hash (5 chars) of the worktree path, or empty string
 *
 * @example
 * ```typescript
 * const id = getWorktreeId();
 * // Returns "a1b2c" locally, "" in CI
 * ```
 */
export const getWorktreeId = (): string => {
  if (process.env.CI) {
    return ""; // CI doesn't need worktree isolation
  }

  try {
    // Get git worktree root (works for both main repo and worktrees)
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- Safe: hardcoded git command in test utility, no user input
    const worktreeRoot = execSync("git rev-parse --show-toplevel", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    // Create short hash of the path
    // eslint-disable-next-line sonarjs/hashing -- Safe: MD5 used only for non-cryptographic identifier generation in tests
    const hash = createHash("md5").update(worktreeRoot).digest("hex");
    return hash.slice(0, 5); // e.g., "a1b2c"
  } catch {
    return ""; // Fallback if not in a git repo
  }
};

/**
 * Get base port for this worktree.
 * Different worktrees get different port ranges to avoid conflicts.
 *
 * Port allocation:
 * - CI/non-worktree: starts at 3002
 * - Worktrees: 3000 + (hash % 90) * 100, giving ranges like 3000-3089, 3100-3189, etc.
 *
 * @returns Base port number for this worktree
 *
 * @example
 * ```typescript
 * const basePort = getWorktreeBasePort();
 * const workerPort = basePort + workerIndex; // e.g., 3100 + 0 = 3100
 * ```
 */
export const getWorktreeBasePort = (): number => {
  const worktreeId = getWorktreeId();

  if (!worktreeId) {
    return 3002; // Default for CI or non-worktree
  }

  // Convert first 4 hex chars to number, mod 90 to get offset 0-89
  // This gives port ranges 3000-3089, 3100-3189, ..., 11900-11989
  const offset = parseInt(worktreeId.slice(0, 4), 16) % 90;
  return 3000 + offset * 100;
};

/**
 * Get database name prefix for this worktree.
 *
 * @returns Database prefix including worktree hash if applicable
 *
 * @example
 * ```typescript
 * const prefix = getWorktreeDatabasePrefix();
 * // Returns "timetiles_test_e2e_a1b2c" locally
 * // Returns "timetiles_test_e2e" in CI
 * const dbName = `${prefix}_${workerIndex}`; // e.g., "timetiles_test_e2e_a1b2c_0"
 * ```
 */
export const getWorktreeDatabasePrefix = (): string => {
  const worktreeId = getWorktreeId();
  return worktreeId ? `timetiles_test_e2e_${worktreeId}` : "timetiles_test_e2e";
};
