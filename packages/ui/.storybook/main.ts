import path from "node:path";

import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-themes", "@storybook/addon-a11y"],
  viteFinal(config) {
    config.resolve ??= {};
    config.resolve.alias = { ...config.resolve.alias, "@timetiles/ui": path.resolve(import.meta.dirname, "../src") };

    // Use @tailwindcss/vite instead of @tailwindcss/postcss for proper
    // source scanning in Storybook's Vite context.
    config.plugins ??= [];
    config.plugins.push(tailwindcss());

    // Disable PostCSS to avoid double-processing with the Vite plugin.
    config.css ??= {};
    config.css.postcss = "";

    return config;
  },
};

export default config;
