import pino from "pino";

const isDevelopment = process.env.NODE_ENV === "development";
const isTest = process.env.NODE_ENV === "test";
const isProduction = process.env.NODE_ENV === "production";

// Define log level based on environment
const getLogLevel = () => {
  if (isTest) {
    // In tests, default to silent unless LOG_LEVEL is explicitly set
    return process.env.LOG_LEVEL || "silent";
  }
  if (isProduction) return "info";
  return "debug"; // Show all logs in development
};

// Create base logger configuration
const baseConfig: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || getLogLevel(),
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    env: process.env.NODE_ENV,
  },
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
    },
  },
};

// Create the logger instance
export const logger =
  isDevelopment && !isTest ? pino(developmentConfig) : pino(baseConfig);

// Create child loggers for different modules
export const createLogger = (module: string) => {
  return logger.child({ module });
};

// Helper to create request logger
export const createRequestLogger = (
  requestId: string,
  userId?: string | number,
) => {
  return logger.child({
    requestId,
    userId,
    type: "request",
  });
};

// Helper to create job logger
export const createJobLogger = (jobId: string | number, taskType: string) => {
  return logger.child({
    jobId,
    taskType,
    type: "job",
  });
};

// Performance logging helper
export const logPerformance = (
  operation: string,
  duration: number,
  metadata?: Record<string, unknown>,
) => {
  logger.info(
    {
      type: "performance",
      operation,
      duration,
      ...metadata,
    },
    `${operation} completed in ${duration}ms`,
  );
};

// Error logging helper with context
export const logError = (
  error: unknown,
  context: string,
  metadata?: Record<string, unknown>,
) => {
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error(
    {
      err,
      context,
      ...metadata,
    },
    `Error in ${context}: ${err.message}`,
  );
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
