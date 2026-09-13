/**
 * Runs pnpm without resolving it through PATH.
 *
 * Scripts started via a pnpm script get the pnpm entry file in `npm_execpath`;
 * executing it with the current Node binary avoids a PATH lookup.
 *
 * @module
 * @category Scripts
 */
import { execFileSync, type ExecFileSyncOptions } from "node:child_process";

export const runPnpmSync = (args: readonly string[], options: ExecFileSyncOptions = {}): Buffer | string => {
  const pnpmEntry = process.env.npm_execpath;
  if (!pnpmEntry) {
    throw new Error("npm_execpath is not set: start this script through its pnpm script");
  }
  return execFileSync(process.execPath, [pnpmEntry, ...args], options);
};
