/**
 * Prints `name@version` for the SDK build tools as locked for packages/scraper in pnpm-lock.yaml.
 *
 * Usage: node locked-build-tools.mjs <pnpm-lock.yaml>. Exits non-zero when a tool is not locked.
 *
 * @module
 * @category Scripts
 */
import { readFileSync } from "node:fs";
import process from "node:process";

export const BUILD_TOOLS = ["tsup", "typescript", "@types/node"];

/** Lines indented deeper than `header`, up to the next line at or above its level. */
const block = (lines, header) => {
  const start = lines.indexOf(header);
  if (start === -1) return [];
  const depth = header.length - header.trimStart().length;
  const end = lines.findIndex(
    (line, i) => i > start && line.trim() !== "" && line.length - line.trimStart().length <= depth
  );
  return lines.slice(start + 1, end === -1 ? lines.length : end);
};

export const lockedBuildTools = (lockfile) => {
  const devDependencies = block(block(lockfile.split("\n"), "  packages/scraper:"), "    devDependencies:");
  const locked = BUILD_TOOLS.map((tool) => {
    const key = tool.startsWith("@") ? `'${tool}'` : tool;
    const version = block(devDependencies, `      ${key}:`)
      .map((line) => line.trim())
      .find((line) => line.startsWith("version: "))
      ?.slice("version: ".length)
      .split("(")[0];
    return { tool, version };
  });
  const missing = locked.filter(({ version }) => !version).map(({ tool }) => tool);
  if (missing.length > 0) throw new Error(`not locked for packages/scraper: ${missing.join(", ")}`);
  return locked.map(({ tool, version }) => `${tool}@${version}`);
};

if (process.argv[1] === import.meta.filename) {
  process.stdout.write(`${lockedBuildTools(readFileSync(process.argv[2], "utf-8")).join(" ")}\n`);
}
