/**
 * Structured logger for TimeScrape runner.
 *
 * @module
 * @category Lib
 */

// Default import (not named): pino 10's named `{ pino }` export no longer
// carries the namespace types (LoggerOptions/Logger) or statics
// (multistream/destination). The default export does.
import pino from "pino";

const baseConfig: pino.LoggerOptions = { name: "timescrape", level: process.env.LOG_LEVEL ?? "info" };

const developmentConfig: pino.LoggerOptions = {
  ...baseConfig,
  transport: { target: "pino-pretty", options: { colorize: true } },
};

// When LOG_FILE is set, write to both stdout and the file (journalctl + persistent file).
const createLogger = (): pino.Logger => {
  const logFile = process.env.LOG_FILE;
  const isDevelopment = process.env.NODE_ENV === "development";

  if (!logFile) return pino(isDevelopment ? developmentConfig : baseConfig);

  // A transport in the options cannot be combined with multistream, so in development the
  // pretty printer becomes one of the streams — same shape as apps/web's logger. Skipping the
  // file in development instead (as this did) meant one LOG_FILE with two different meanings
  // across the two apps.
  const stdoutStream = isDevelopment ? pino.transport(developmentConfig.transport!) : process.stdout;
  return pino(baseConfig, pino.multistream([{ stream: stdoutStream }, { stream: pino.destination(logFile) }]));
};

export const logger = createLogger();

// Error-first argument order, matching apps/web's logError.
export const logError = (error: unknown, message: string, context?: Record<string, unknown>): void => {
  const errorInfo =
    error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
  logger.error({ error: errorInfo, ...context }, message);
};
