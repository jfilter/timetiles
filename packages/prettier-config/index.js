/**
 * Shared Prettier configuration for the TimeTiles monorepo
 *
 * This configuration provides consistent code formatting across all packages
 * and applications in the monorepo.
 * @module
 */

// eslint-disable-next-line no-undef
module.exports = {
  plugins: ["prettier-plugin-tailwindcss"],
  printWidth: 120,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: false,
  quoteProps: "as-needed",
  jsxSingleQuote: false,
  trailingComma: "es5",
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: "always",
  endOfLine: "lf",
};
