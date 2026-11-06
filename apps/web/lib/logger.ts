/**
 * Configures the application's logging system using the `pino` library.
 *
 * This module sets up a structured, high-performance logger. It is configured to:
 * - Use pretty-printing for readability in development environments.
 * - Output structured JSON logs in production for easier parsing and analysis.
 * - Control log levels based on the environment (e.g., `debug` in dev, `info` in prod).
 * - Provide helper functions to create specialized child loggers for requests, jobs,
 *   performance monitoring, and error reporting.
 *
 * @module
 */
import pino from "pino";

// pino 10's `LogFn` rejects extra positional args after a message without printf
// placeholders. The codebase logs message-first (`logger.info("msg", { context })`),
// which behaves the same at runtime, so the permissive signature is restored here.
interface PermissiveLogFn {
  (obj: object, msg?: string, ...args: unknown[]): void;
  (msg: string, ...args: unknown[]): void;
}
type LoggerLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
type AppLogger = Omit<pino.Logger, LoggerLevel | "child"> &
  Record<LoggerLevel, PermissiveLogFn> & {
    child: (bindings: pino.Bindings, options?: pino.ChildLoggerOptions) => AppLogger;
  };

// Logger reads process.env directly (not getEnv()) because it initializes at
// module load time — before dotenv runs in test setups. Using getEnv() here
// would cache an incomplete environment and break database connections.
const nodeEnv = process.env.NODE_ENV ?? "development";
const logLevel = process.env.LOG_LEVEL;
const logFile = process.env.LOG_FILE;
const isDevelopment = nodeEnv === "development";
const isTest = nodeEnv === "test";
const isProduction = nodeEnv === "production";

const getLogLevel = () => {
  if (isTest) {
    // In tests, default to silent unless LOG_LEVEL is explicitly set
    return logLevel ?? "silent";
  }
  if (isProduction) return "info";
  return "debug"; // Show all logs in development
};

const baseConfig: pino.LoggerOptions = {
  level: logLevel ?? getLogLevel(),
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { env: nodeEnv },
};

const developmentConfig: pino.LoggerOptions = {
  ...baseConfig,
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      ignore: "pid,hostname",
      translateTime: "yyyy-mm-dd HH:MM:ss",
      messageFormat: "{msg}",
      hideObject: true, // Hide metadata objects to avoid duplication (error objects still shown)
    },
  },
};

// JSON to stdout, plus to LOG_FILE when set.
const createProductionLogger = (): pino.Logger => {
  if (logFile) {
    return pino(baseConfig, pino.multistream([{ stream: process.stdout }, { stream: pino.destination(logFile) }]));
  }
  return pino(baseConfig);
};

// Pretty-printed stdout, plus structured JSON to LOG_FILE when set.
const createDevLogger = (): pino.Logger => {
  if (logFile) {
    // Pretty-print to stdout AND structured JSON to file (for post-mortem debugging)
    return pino(
      baseConfig,
      pino.multistream([
        { stream: pino.transport(developmentConfig.transport!) },
        { stream: pino.destination(logFile) },
      ])
    );
  }
  return pino(developmentConfig);
};

export const logger = (isDevelopment && !isTest ? createDevLogger() : createProductionLogger()) as unknown as AppLogger;

export const createLogger = (module: string) => {
  return logger.child({ module });
};

export const createRequestLogger = (requestId: string, userId?: string | number) => {
  return logger.child({ requestId, userId, type: "request" });
};

export const createJobLogger = (jobId: string | number, taskType: string) => {
  return logger.child({ jobId, taskType, type: "job" });
};

export const logPerformance = (operation: string, duration: number, metadata?: Record<string, unknown>) => {
  logger.info({ type: "performance", operation, duration, ...metadata }, `${operation} completed in ${duration}ms`);
};

export const logError = (error: unknown, context: string, metadata?: Record<string, unknown>) => {
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error({ err, context, ...metadata }, `Error in ${context}: ${err.message}`);
};
