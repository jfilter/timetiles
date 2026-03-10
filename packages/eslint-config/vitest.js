/**
 * ESLint configuration for Vitest test files.
 *
 * Re-exports the base config. All Vitest-specific rules are now handled by oxlint.
 *
 * @module
 */
import baseConfig from "./base.js";

/**
 * @type {import("eslint").Linter.Config}
 */
export default [...baseConfig];
