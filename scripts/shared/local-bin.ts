/**
 * Resolves workspace tool binaries to absolute paths, so scripts never run a
 * command found through PATH.
 *
 * @module
 * @category Scripts
 */
import fs from "node:fs";
import path from "node:path";

export const WORKSPACE_ROOT = path.resolve(__dirname, "../..");

/**
 * Absolute path of `node_modules/.bin/<name>`, looked up like `pnpm exec`: the
 * package in `cwd` first, then the workspace root. A missing tool fails at spawn.
 */
export const localBin = (name: string, cwd = process.cwd()): string => {
  const packageBin = path.resolve(cwd, "node_modules", ".bin", name);
  return fs.existsSync(packageBin) ? packageBin : path.join(WORKSPACE_ROOT, "node_modules", ".bin", name);
};
