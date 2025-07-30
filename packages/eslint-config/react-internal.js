/**
 * @module This file contains the ESLint configuration for internal React packages.
 *
 * It extends the base configuration and adds React-specific rules, including those
 * from the React Compiler and performance-related plugins. This configuration is
 * intended for internal UI packages and components within the monorepo.
 */
import reactCompiler from "eslint-plugin-react-compiler";
import reactPerf from "eslint-plugin-react-perf";

import baseConfig from "./base.js";

/**
 * @type {import("eslint").Linter.Config}
 */
export default [
  ...baseConfig,
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "react-compiler": reactCompiler,
      "react-perf": reactPerf,
    },
    rules: {
      "react-compiler/react-compiler": "error",
      "react-perf/jsx-no-new-object-as-prop": "error",
      "react-perf/jsx-no-new-array-as-prop": "error",
      "react-perf/jsx-no-new-function-as-prop": "error",
    },
  },
];
