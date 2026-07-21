#!/usr/bin/env tsx
/**
 * Wrapper to run tsgo and generate JSON results for check-ai.
 *
 * @module
 * @category Scripts
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { createTimestamp, parseTscOutput, pruneOldResults, type TypeScriptError } from "./shared/typecheck-utils";

const historyDir = path.join(process.cwd(), ".typecheck-results");
fs.mkdirSync(historyDir, { recursive: true });
const resultsPath = path.join(historyDir, `${createTimestamp()}.json`);

let errors: TypeScriptError[] = [];
/**
 * Set when tsgo itself broke rather than reporting type errors — a bad
 * tsconfig, a crash, an OOM, a missing binary. Previously such a run produced
 * zero parsed diagnostics and therefore `success: true`, so a typechecker that
 * never typechecked anything read as a passing gate in CI.
 */
let runnerError: string | undefined;

const run = spawnSync("pnpm", ["exec", "tsgo", "--noEmit", "--pretty", "false"], { encoding: "utf-8" });
const output = (run.stdout ?? "") + "\n" + (run.stderr ?? "");

if (run.error) {
  runnerError = `tsgo could not be started: ${run.error.message}`;
} else if (run.status !== 0) {
  errors = parseTscOutput(output);
  if (errors.length === 0) {
    runnerError =
      `tsgo exited ${run.status ?? `on signal ${run.signal}`} without emitting any parseable ` +
      `diagnostics, so no typecheck was performed.\n${output.trim() || "(no output)"}`;
  }
}

const errorCount = errors.filter((e) => e.severity === "error").length;
const success = errorCount === 0 && runnerError === undefined;

fs.writeFileSync(
  resultsPath,
  JSON.stringify({ success, errorCount, errors, runnerError, timestamp: new Date().toISOString() }, null, 2)
);
pruneOldResults(historyDir);

if (runnerError !== undefined) {
  // eslint-disable-next-line no-console
  console.error(`❌ Typecheck did not run: ${runnerError}`);
}

if (!success) {
  process.exit(1);
}
