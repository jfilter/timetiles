/**
 * E2E accessibility tests with color contrast checking.
 *
 * Runs axe-core WCAG 2.1 AA checks on all major pages in both
 * light and dark modes. Covers color contrast, missing labels,
 * ARIA issues, heading hierarchy, and other WCAG violations.
 *
 * @module
 * @category E2E Tests
 */
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures";

interface PageConfig {
  /** Human-readable name for test titles */
  name: string;
  /** URL path to navigate to */
  path: string;
  /** Whether authentication is required */
  requiresAuth: boolean;
  /** Optional wait condition after navigation */
  waitFor?: (page: Page) => Promise<void>;
  /** CSS selectors to exclude from axe analysis (third-party widgets) */
  exclude?: string[];
}

const pages: PageConfig[] = [
  {
    name: "Homepage",
    path: "/",
    requiresAuth: false,
    waitFor: async (page) => {
      await page
        .locator("header, [role='banner'], main, [role='main']")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
    },
  },
  {
    name: "Login",
    path: "/login",
    requiresAuth: false,
    waitFor: async (page) => {
      // Suspense hydration can take time on production builds
      await page.getByRole("button", { name: /sign in/i }).waitFor({ state: "visible", timeout: 15_000 });
    },
  },
  {
    name: "Events List",
    path: "/events",
    requiresAuth: false,
    waitFor: async (page) => {
      await page.getByRole("heading", { name: /events/i }).waitFor({ state: "visible", timeout: 10_000 });
    },
  },
  {
    name: "Forgot Password",
    path: "/forgot-password",
    requiresAuth: false,
    waitFor: async (page) => {
      await page.getByRole("button", { name: /send reset link/i }).waitFor({ state: "visible", timeout: 15_000 });
    },
  },
  {
    name: "Explore",
    path: "/explore",
    requiresAuth: true,
    waitFor: async (page) => {
      await page.getByRole("region", { name: "Map" }).first().waitFor({ state: "visible", timeout: 15_000 });
      await page.waitForSelector('button:has-text("datasets")', { timeout: 15_000 }).catch(() => {
        // Dataset buttons may not appear if no data, continue anyway
      });
    },
    exclude: [
      ".maplibregl-canvas", // WebGL canvas — not analyzable by axe
      ".maplibregl-ctrl-attrib", // MapLibre attribution — third-party
      ".maplibregl-ctrl-group", // MapLibre controls — third-party
    ],
  },
  {
    name: "Import Wizard",
    path: "/ingest",
    requiresAuth: true,
    waitFor: async (page) => {
      await page
        .getByRole("heading", { name: /upload|import/i })
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
    },
  },
  {
    name: "Import Activity",
    path: "/account/imports",
    requiresAuth: true,
    waitFor: async (page) => {
      await page
        .getByRole("heading", { name: /import/i })
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
    },
  },
  {
    name: "Account Settings",
    path: "/account/settings",
    requiresAuth: true,
    waitFor: async (page) => {
      await page
        .getByRole("heading", { name: /settings|account/i })
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
    },
  },
];

const themes = ["light", "dark"] as const;
type ThemeMode = (typeof themes)[number];

type AxeViolations = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"];

/**
 * Format axe violations into a readable summary for test failure messages.
 */
const formatViolations = (violations: AxeViolations): string => {
  if (violations.length === 0) return "No violations";
  return violations
    .map((v) => {
      const targets = v.nodes
        .slice(0, 3)
        .map((n) => `    ${n.target.join(" > ")}`)
        .join("\n");
      return `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} elements)\n${targets}`;
    })
    .join("\n\n");
};

/**
 * Run axe analysis on a page with the given theme.
 */
const analyzeAccessibility = async (testPage: Page, pageConfig: PageConfig, theme: ThemeMode): Promise<void> => {
  // Set localStorage before any page scripts run
  await testPage.context().addInitScript((t: string) => {
    localStorage.setItem("timetiles-theme", t);
  }, theme);

  await testPage.goto(pageConfig.path, { waitUntil: "domcontentloaded" });

  // Verify theme was applied to <html>
  const hasDarkClass = await testPage.evaluate(() => document.documentElement.classList.contains("dark"));
  if (theme === "dark") {
    expect(hasDarkClass, "Expected .dark class on <html> for dark mode").toBe(true);
  } else {
    expect(hasDarkClass, "Expected no .dark class on <html> for light mode").toBe(false);
  }

  // Wait for page-specific content to render
  if (pageConfig.waitFor) {
    await pageConfig.waitFor(testPage);
  } else {
    await testPage.waitForLoadState("networkidle");
  }

  // Build axe analysis
  let builder = new AxeBuilder({ page: testPage }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]);

  // Exclude third-party elements that can't be fixed
  if (pageConfig.exclude) {
    for (const selector of pageConfig.exclude) {
      builder = builder.exclude(selector);
    }
  }

  const results = await builder.analyze();

  expect(results.violations, `${pageConfig.name} (${theme}):\n${formatViolations(results.violations)}`).toHaveLength(0);
};

test.describe("Accessibility", () => {
  for (const pageConfig of pages) {
    test.describe(pageConfig.name, () => {
      for (const theme of themes) {
        if (pageConfig.requiresAuth) {
          // Auth pages: use the default page fixture (has stored auth state)
          test(`${theme} mode passes WCAG 2.1 AA`, async ({ page }) => {
            await analyzeAccessibility(page, pageConfig, theme);
          });
        } else {
          // Public pages: create a fresh context without auth state
          // (Login/Forgot Password redirect authenticated users)
          test(`${theme} mode passes WCAG 2.1 AA`, async ({ browser, baseURL }) => {
            const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
            const freshPage = await context.newPage();
            try {
              await analyzeAccessibility(freshPage, pageConfig, theme);
            } finally {
              await context.close();
            }
          });
        }
      }
    });
  }
});
