/**
 * Structured logger for TimeScrape runner.
 *
 * @module
 * @category Lib
 */

import { pino } from "pino";

export const logger = pino({
  name: "timescrape",
  level: process.env.LOG_LEVEL ?? "info",
  transport:
    process.env.NODE_ENV === "development" ? { target: "pino-pretty", options: { colorize: true } } : undefined,
});

export function logError(message: string, error: unknown, context?: Record<string, unknown>): void {
  const errorInfo =
    error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
  logger.error({ error: errorInfo, ...context }, message);
}
