#!/usr/bin/env tsx
/**
 * Wrapper to run tsgo (TypeScript 7) and generate JSON results for check-ai.
 *
 * @module
 * @category Scripts
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { createTimestamp, parseTscOutput, pruneOldResults, type TypeScriptError } from "./shared/typecheck-utils";

const historyDir = path.join(process.cwd(), ".typecheck-results");
fs.mkdirSync(historyDir, { recursive: true });
const resultsPath = path.join(historyDir, `${createTimestamp()}.json`);

let errors: TypeScriptError[] = [];

try {
  execSync("pnpm exec tsgo --noEmit --pretty false 2>&1", { encoding: "utf-8" });
} catch (error) {
  const e = error as { stdout?: string | Buffer; stderr?: string | Buffer };
  errors = parseTscOutput((e.stdout?.toString() ?? "") + "\n" + (e.stderr?.toString() ?? ""));
}

const errorCount = errors.filter((e) => e.severity === "error").length;
const success = errorCount === 0;

fs.writeFileSync(resultsPath, JSON.stringify({ success, errorCount, errors, timestamp: new Date().toISOString() }, null, 2));
pruneOldResults(historyDir);

if (!success) {
  process.exit(1);
}
