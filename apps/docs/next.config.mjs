import { createRequire } from "node:module";
import nextra from "nextra";

const require = createRequire(import.meta.url);

const withNextra = nextra({
  // Default content directory is 'content'
  // Enable search
  search: { codeblocks: true },
  // Enable LaTeX support
  latex: false,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@timetiles/ui", "@timetiles/assets"],
  // Static export only for production builds — dev mode doesn't need it and it
  // forces generateStaticParams enumeration that breaks on non-MDX paths like favicon.ico
  ...(process.env.NODE_ENV === "production" && { output: "export" }),
  trailingSlash: true,
  images: { unoptimized: true },
  webpack: (config) => {
    // Handle SVG and PNG imports as URLs
    config.module.rules.push({ test: /\.(svg|png|jpg|jpeg|gif|ico)$/, type: "asset/resource" });

    // Fix @theguild/remark-mermaid resolution — the plugin injects an absolute
    // filesystem path as an import specifier which Turbopack/webpack can mangle
    // with a "./" prefix. Aliasing the package name ensures stable resolution.
    config.resolve.alias["@theguild/remark-mermaid/mermaid"] = require.resolve("@theguild/remark-mermaid/mermaid");

    return config;
  },
};

export default withNextra(nextConfig);
