import type { Preview } from "@storybook/react-vite";
import { withThemeByClassName } from "@storybook/addon-themes";
import * as React from "react";

import { UIProvider } from "../src/provider";

import "../src/styles/globals.css";
// Theme CSS must be imported directly here because the @import inside
// globals.css is silently dropped by Vite (CSS spec requires @import
// before all other statements, but Tailwind v4's @source precedes it).
import "../src/themes/cartographic.css";
import "../src/themes/modern.css";

const preview: Preview = {
  decorators: [
    withThemeByClassName({
      themes: {
        "Cartographic Light": "",
        "Cartographic Dark": "dark",
        "Modern Light": "theme-modern",
        "Modern Dark": "theme-modern dark",
      },
      defaultTheme: "Cartographic Light",
    }),
    (Story) => (
      <UIProvider
        resolveTheme={() => {
          return document.documentElement.classList.contains("dark") ? "dark" : "light";
        }}
      >
        <Story />
      </UIProvider>
    ),
  ],
  parameters: { layout: "centered" },
};

export default preview;
