#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Standalone oxfmt format check with AI-friendly output.
 *
 * Used by the package-scoped `make check-ai PACKAGE=...` branches, which delegate
 * lint/typecheck to per-package scripts and therefore cannot reuse the format
 * section built into `check-ai.ts` / `check-ai-files.ts`.
 *
 * Usage: tsx scripts/check-format-ai.ts [path ...]   (defaults to the whole tree)
 *
 * @module
 * @category Scripts
 */
import { reportFormatSection, runFormatCheck } from "./shared/format-utils";

const paths = process.argv.slice(2);
const result = runFormatCheck(paths, process.cwd());

reportFormatSection(result);

// A tool failure is a failed gate, not a clean run.
process.exit(result.unformatted.length > 0 || result.toolError !== undefined ? 1 : 0);
