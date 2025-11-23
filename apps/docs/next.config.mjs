import nextra from "nextra";

const withNextra = nextra({
  // Default content directory is 'content'
  // Enable search
  search: {
    codeblocks: true,
  },
  // Enable LaTeX support
  latex: false,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@timetiles/ui", "@timetiles/assets"],
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
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
