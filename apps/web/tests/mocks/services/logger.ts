/**
 * Centralized logger mock for unit tests.
 *
 * This mock replaces the real Pino logger to prevent log output during tests
 * and enable verification of logging calls when needed.
 *
 * Tests can import { mockLogger } to verify logging calls.
 *
 * @module
 * @category Tests
 */
import { vi } from "vitest";

/**
 * Creates a mock logger instance with common logging methods.
 * Used for child loggers (createJobLogger, createRequestLogger, etc.)
 */
export const createMockLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn(() => createMockLogger()),
});

/**
 * Shared logger instance - this is what gets returned by logger export.
 * Tests can access this to verify logging calls.
 */
const sharedLogger = createMockLogger();

/**
 * Mock implementations for all logger exports.
 * Import this in your tests to verify logging calls:
 *
 * ```typescript
 * import { mockLogger } from "@/tests/mocks/services/logger";
 * expect(mockLogger.logger.info).toHaveBeenCalledWith(...);
 * ```
 */
export const mockLogger = {
  createJobLogger: vi.fn(() => createMockLogger()),
  createRequestLogger: vi.fn(() => createMockLogger()),
  createLogger: vi.fn(() => createMockLogger()),
  logError: vi.fn(),
  logPerformance: vi.fn(),
  logger: sharedLogger,
  LogLevel: {
    TRACE: "trace",
    DEBUG: "debug",
    INFO: "info",
    WARN: "warn",
    ERROR: "error",
    FATAL: "fatal",
  },
};

/**
 * Apply this mock to replace @/lib/logger in your tests.
 *
 * Usage in test files:
 * ```typescript
 * import "@/tests/mocks/services/logger";
 * ```
 *
 * The mock is automatically applied via vi.mock().
 */
vi.mock("@/lib/logger", () => ({
  createJobLogger: mockLogger.createJobLogger,
  createRequestLogger: mockLogger.createRequestLogger,
  createLogger: mockLogger.createLogger,
  logError: mockLogger.logError,
  logPerformance: mockLogger.logPerformance,
  logger: sharedLogger,
  LogLevel: mockLogger.LogLevel,
}));
