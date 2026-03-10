/**
 * ESLint configuration for Next.js applications.
 *
 * Re-exports the react-internal config. All Next.js-specific rules (@next/next)
 * and TanStack Query rules are now handled by oxlint.
 *
 * @module
 */

// Re-export defaultIgnores for apps to use
export { defaultIgnores } from "./base.js";
import reactConfig from "./react-internal.js";

/**
 * @type {import("eslint").Linter.Config}
 */
export default [...reactConfig];
