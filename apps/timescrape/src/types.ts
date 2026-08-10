/**
 * Shared types for TimeScrape runner.
 *
 * The run contract itself lives in `@timetiles/shared` so the web app and the
 * runner cannot drift; these aliases keep the local call sites unchanged.
 *
 * @module
 * @category Types
 */

import type { ScraperRunRequest, ScraperRunResult } from "@timetiles/shared";

export type RunRequest = ScraperRunRequest;

export type RunResult = ScraperRunResult;
