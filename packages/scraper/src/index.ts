/**
 * TimeTiles Scraper SDK — helpers for building scrapers.
 *
 * @module
 * @category SDK
 *
 * @example
 * ```ts
 * import { output } from '@timetiles/scraper';
 *
 * output.writeRow({ title: "Event", date: "2026-01-01", location: "Berlin" });
 * output.save();
 * ```
 */
export { output, OutputWriter, type OutputRow } from "./output.js";
