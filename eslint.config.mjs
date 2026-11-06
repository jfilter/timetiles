/**
 * ESLint configuration for root-level files
 */
import baseConfig, { defaultIgnores, oxlintBridge } from "@timetiles/eslint-config/base";

export default [
  defaultIgnores,
  ...baseConfig,
  {
    // Override the base tsconfigRootDir for root files
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
  },
  // Must stay last, see oxlintBridge.
  ...oxlintBridge,
];
