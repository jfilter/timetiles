/**
 * Structured logger for TimeScrape runner.
 *
 * @module
 * @category Lib
 */

import { pino } from "pino";

const baseConfig: pino.LoggerOptions = {
  name: "timescrape",
  level: process.env.LOG_LEVEL ?? "info",
  transport:
    process.env.NODE_ENV === "development" ? { target: "pino-pretty", options: { colorize: true } } : undefined,
};

// When LOG_FILE is set, write to both stdout and the file (journalctl + persistent file)
const createLogger = (): pino.Logger => {
  if (process.env.LOG_FILE && process.env.NODE_ENV !== "development") {
    return pino(
      baseConfig,
      pino.multistream([{ stream: process.stdout }, { stream: pino.destination(process.env.LOG_FILE) }])
    );
  }
  return pino(baseConfig);
};

export const logger = createLogger();

export function logError(message: string, error: unknown, context?: Record<string, unknown>): void {
  const errorInfo =
    error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
  logger.error({ error: errorInfo, ...context }, message);
}
