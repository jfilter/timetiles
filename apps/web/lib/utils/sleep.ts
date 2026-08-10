/**
 * Promise-based delay.
 *
 * @module
 * @category Utils
 */

/** Resolve after `ms` milliseconds. */
export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
