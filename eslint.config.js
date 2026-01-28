import baseConfig, { defaultIgnores } from "@timetiles/eslint-config/base";

/**
 * ESLint configuration for root-level files
 */
export default [
  defaultIgnores,
  ...baseConfig,
  {
    // Override the base tsconfigRootDir for root files
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Only lint specific files in root to avoid noise
    files: ["*.js", "*.ts", "*.mjs", "scripts/**/*"],
    ignores: ["apps/**", "packages/**"],
  },
];
