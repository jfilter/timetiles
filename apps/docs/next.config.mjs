import nextra from "nextra";

const withNextra = nextra({
  theme: "nextra-theme-docs",
  themeConfig: "./theme.config.tsx",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/ui", "@timetiles/assets"],
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  basePath: process.env.NODE_ENV === "production" ? "/timetiles" : "",
  assetPrefix: process.env.NODE_ENV === "production" ? "/timetiles/" : "",
  webpack: (config) => {
    // Handle SVG and PNG imports as URLs
    config.module.rules.push({
      test: /\.(svg|png|jpg|jpeg|gif|ico)$/,
      type: "asset/resource",
    });

    return config;
  },
};

export default withNextra(nextConfig);
