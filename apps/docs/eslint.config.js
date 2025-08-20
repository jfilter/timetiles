import mdxConfig from "@workspace/eslint-config/mdx";

/** @type {import("eslint").Linter.Config[]} */
export default [
  // Global ignores for auto-generated API documentation
  {
    ignores: [
      "pages/reference/api/**/*.md",
      "pages/reference/api/**/*.mdx",
      // Keep manual files
      "!pages/reference/api/index.mdx",
      "!pages/reference/api/_meta.json",
    ],
  },
  // Apply MDX config to all MDX/MD files (except those ignored above)
  ...mdxConfig,
];
