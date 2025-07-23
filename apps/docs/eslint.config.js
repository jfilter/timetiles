import mdxConfig from "@workspace/eslint-config/mdx";

/** @type {import("eslint").Linter.Config[]} */
export default [
  // Use Next.js built-in ESLint for regular files via next lint
  // Only configure MDX files explicitly here
  ...mdxConfig,
];
