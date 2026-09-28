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

/**
 * Binary and arguments of a plain root `package.json` script (no shell syntax),
 * so callers can run exactly that script from the workspace root without pnpm.
 */
export const rootScriptCommand = (name: string): { bin: string; args: string[] } => {
  const pkg = JSON.parse(fs.readFileSync(path.join(WORKSPACE_ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string | undefined>;
  };
  const [command, ...args] = pkg.scripts[name]?.split(" ") ?? [];
  if (!command || args.some((arg) => /[&|;<>$`'"]/.test(arg))) {
    throw new Error(`Root script "${name}" is missing or is not a plain command`);
  }
  return { bin: localBin(command, WORKSPACE_ROOT), args };
};
