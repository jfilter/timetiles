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

// Logger reads process.env directly (not getEnv()) because it initializes at
// module load time — before dotenv runs in test setups. Using getEnv() here
// would cache an incomplete environment and break database connections.
const nodeEnv = process.env.NODE_ENV ?? "development";
const logLevel = process.env.LOG_LEVEL;
const logFile = process.env.LOG_FILE;
const isDevelopment = nodeEnv === "development";
const isTest = nodeEnv === "test";
const isProduction = nodeEnv === "production";

// Define log level based on environment
const getLogLevel = () => {
  if (isTest) {
    // In tests, default to silent unless LOG_LEVEL is explicitly set
    return logLevel ?? "silent";
  }
  if (isProduction) return "info";
  return "debug"; // Show all logs in development
};

// Create base logger configuration
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

// Development configuration with pretty printing
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

// Create the logger instance
// When LOG_FILE is set, write to both stdout and the file (for Docker logs + persistent file)
const createProductionLogger = (): pino.Logger => {
  if (logFile) {
    return pino(baseConfig, pino.multistream([{ stream: process.stdout }, { stream: pino.destination(logFile) }]));
  }
  return pino(baseConfig);
};

// In development: pretty-print to stdout + optionally write structured JSON to LOG_FILE
// In production: structured JSON to stdout + optionally to LOG_FILE
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

export const logger = isDevelopment && !isTest ? createDevLogger() : createProductionLogger();

// Create child loggers for different modules
export const createLogger = (module: string) => {
  return logger.child({ module });
};

// Helper to create request logger
export const createRequestLogger = (requestId: string, userId?: string | number) => {
  return logger.child({ requestId, userId, type: "request" });
};

// Helper to create job logger
export const createJobLogger = (jobId: string | number, taskType: string) => {
  return logger.child({ jobId, taskType, type: "job" });
};

// Performance logging helper
export const logPerformance = (operation: string, duration: number, metadata?: Record<string, unknown>) => {
  logger.info({ type: "performance", operation, duration, ...metadata }, `${operation} completed in ${duration}ms`);
};

// Error logging helper with context
export const logError = (error: unknown, context: string, metadata?: Record<string, unknown>) => {
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error({ err, context, ...metadata }, `Error in ${context}: ${err.message}`);
};

// Export log levels for convenience
export const LogLevel = {
  TRACE: "trace",
  DEBUG: "debug",
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
  FATAL: "fatal",
} as const;

export type LogLevelType = (typeof LogLevel)[keyof typeof LogLevel];
