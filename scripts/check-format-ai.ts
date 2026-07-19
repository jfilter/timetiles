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
const unformatted = runFormatCheck(paths, process.cwd());

reportFormatSection(unformatted);

process.exit(unformatted.length > 0 ? 1 : 0);
