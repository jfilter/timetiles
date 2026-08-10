/**
 * Path-safety predicates for user-supplied scraper manifest values.
 *
 * The web app validates manifests at SYNC time and the timescrape runner
 * re-validates at RUN time; both must apply the exact same rules, otherwise a
 * manifest accepted by one side fails with an opaque 400 on the other.
 *
 * @module
 */

/** Relative path without traversal — safe to resolve inside the scraper workdir. */
export const isSafeRelativeEntrypoint = (value: string): boolean => !value.includes("..") && !value.startsWith("/");

/** Plain filename: no traversal, no separators, no dotfile. */
export const isPlainOutputFilename = (value: string): boolean =>
  !value.includes("..") && !value.includes("/") && !value.startsWith(".");
