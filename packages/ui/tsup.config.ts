/**
 * tsup build configuration for the UI library.
 *
 * Uses two build passes: one for client components (injects "use client"
 * directive) and one for server-compatible modules.
 *
 * @module
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { defineConfig } from "tsup";

/** Entry points that contain "use client" and must preserve the directive in output. */
const clientEntry: Record<string, string> = {
  index: "./src/index.ts",
  provider: "./src/provider.tsx",
  "hooks/use-chart-theme": "./src/hooks/use-chart-theme.ts",
  "components/charts/index": "./src/components/charts/index.ts",
  "components/checkbox": "./src/components/checkbox.tsx",
  "components/collapsible": "./src/components/collapsible.tsx",
  "components/confirm-dialog": "./src/components/confirm-dialog.tsx",
  "components/content-state": "./src/components/content-state.tsx",
  "components/call-to-action": "./src/components/call-to-action.tsx",
  "components/data-table": "./src/components/data-table.tsx",
  "components/details-grid": "./src/components/details-grid.tsx",
  "components/dialog": "./src/components/dialog.tsx",
  "components/dropdown-menu": "./src/components/dropdown-menu.tsx",
  "components/features": "./src/components/features.tsx",
  "components/footer": "./src/components/footer.tsx",
  "components/label": "./src/components/label.tsx",
  "components/mobile-nav-drawer": "./src/components/mobile-nav-drawer.tsx",
  "components/newsletter-cta": "./src/components/newsletter-cta.tsx",
  "components/newsletter-form": "./src/components/newsletter-form.tsx",
  "components/select": "./src/components/select.tsx",
  "components/table": "./src/components/table.tsx",
  "components/tabs": "./src/components/tabs.tsx",
  "components/testimonials": "./src/components/testimonials.tsx",
  "components/timeline": "./src/components/timeline.tsx",
};

/** Entry points that are server-compatible (no "use client" directive). */
const serverEntry: Record<string, string> = {
  "components/icons/index": "./src/components/icons/index.ts",
  "lib/utils": "./src/lib/utils.ts",
  "lib/chart-themes": "./src/lib/chart-themes.ts",
  "components/button": "./src/components/button.tsx",
  "components/card": "./src/components/card.tsx",
  "components/header": "./src/components/header.tsx",
  "components/header-actions": "./src/components/header-actions.tsx",
  "components/header-brand": "./src/components/header-brand.tsx",
  "components/header-nav": "./src/components/header-nav.tsx",
  "components/hero": "./src/components/hero.tsx",
  "components/input": "./src/components/input.tsx",
  "components/textarea": "./src/components/textarea.tsx",
};

/**
 * Prepends "use client" to all .js files in the given output directory
 * that correspond to client entry points. Called after the client build.
 */
const addUseClientDirective = (outDir: string, entries: Record<string, string>) => {
  const directive = '"use client";\n';
  for (const key of Object.keys(entries)) {
    const filePath = join(outDir, `${key}.js`);
    try {
      const content = readFileSync(filePath, "utf-8");
      if (!content.startsWith('"use client"')) {
        writeFileSync(filePath, directive + content);
      }
    } catch {
      // File may not exist if build failed — skip silently
    }
  }
};

const shared = {
  format: ["esm"] as ["esm"],
  dts: true,
  splitting: false,
  treeshake: true,
  outDir: "dist",
  external: [
    "react",
    "react-dom",
    "react/jsx-runtime",
    /^@radix-ui\//,
    /^@tanstack\//,
    "class-variance-authority",
    "clsx",
    "tailwind-merge",
    "echarts",
    "echarts-for-react",
    "lucide-react",
    "tw-animate-css",
    "zod",
  ],
};

export default defineConfig([
  {
    ...shared,
    entry: clientEntry,
    clean: true,
    onSuccess: () => {
      addUseClientDirective("dist", clientEntry);
      return Promise.resolve();
    },
  },
  { ...shared, entry: serverEntry, clean: false },
]);
