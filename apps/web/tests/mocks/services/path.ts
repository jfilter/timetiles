/**
 * Centralized path module mock for unit tests.
 *
 * This mock replaces Node.js path module with predictable behavior
 * for file path operations in tests.
 *
 * @module
 * @category Tests
 */
import { vi } from "vitest";

/**
 * Mock path module with common methods.
 * Returns predictable paths for testing file operations.
 */
export const mockPath = {
  resolve: vi.fn(() => "/mock/import-files"),
  join: vi.fn((dir: string, filename: string) => `${dir}/${filename}`),
};

/**
 * Apply this mock to replace path module in your tests.
 *
 * Usage in test files:
 * ```typescript
 * import "@/tests/mocks/services/path";
 * ```
 *
 * The mock is automatically applied via vi.mock().
 */
vi.mock("path", () => ({
  default: mockPath,
}));
