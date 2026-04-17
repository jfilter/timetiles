/**
 * Lazy loader for the `xlsx` package.
 *
 * The `xlsx` bundle is large (~800KB parsed JS). Eagerly importing it at
 * module top-level bloats server bundles and slows API route cold starts.
 * Callers should `await loadXlsx()` inside a function body instead of
 * importing `xlsx` directly, so Next.js can split it out of the initial
 * bundle and load it on demand.
 *
 * The module is cached after the first load — subsequent calls are cheap.
 *
 * @module
 */
import type * as Xlsx from "xlsx";

type XlsxModule = typeof Xlsx;

let xlsxPromise: Promise<XlsxModule> | undefined;

/**
 * Dynamically import the `xlsx` package, caching the promise for reuse.
 *
 * Caching the promise (rather than the resolved module) avoids the
 * `require-atomic-updates` TOCTOU: every caller either awaits the same
 * in-flight load or the already-resolved value, so there's no window
 * where two callers can both start a second import.
 *
 * @returns The loaded `xlsx` module.
 */
export const loadXlsx = async (): Promise<XlsxModule> => {
  xlsxPromise ??= import("xlsx");
  return xlsxPromise;
};
