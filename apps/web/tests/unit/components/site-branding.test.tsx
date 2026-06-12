// @vitest-environment jsdom
/**
 * Unit tests for SiteBranding CSS variable injection.
 *
 * Regression: the component used to set the variables as inline style on a
 * childless sibling div — CSS custom properties only cascade to descendants,
 * so every configured branding setting (colors, radius, typography, density)
 * was a silent no-op. They must be emitted as a stylesheet rule scoped to
 * the layout's `data-site` body attribute.
 *
 * @module
 * @category Unit Tests
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteBranding } from "@/components/site-branding";
import { SiteProvider } from "@/lib/context/site-context";
import type { Site } from "@/payload-types";

const makeSite = (overrides: Partial<Site> = {}): Site =>
  ({
    id: 1,
    name: "Test Site",
    slug: "test-site",
    branding: {
      colors: { primary: "#ff0000" },
      style: { borderRadius: "pill" },
      typography: { fontPairing: "classic" },
    },
    ...overrides,
  }) as unknown as Site;

describe("SiteBranding", () => {
  it("emits branding variables as a rule scoped to the site's data-site attribute", () => {
    const { container } = render(
      <SiteProvider site={makeSite()}>
        <SiteBranding />
      </SiteProvider>
    );

    const style = container.querySelector("style");
    expect(style).not.toBeNull();
    const css = style!.textContent ?? "";
    expect(css).toContain('[data-site="test-site"]');
    expect(css).toContain("--primary: #ff0000;");
    expect(css).toContain("--radius: 1rem;");
    expect(css).toContain("--site-font-pairing: classic;");
  });

  it("renders nothing without branding or custom CSS", () => {
    const { container } = render(
      <SiteProvider site={null}>
        <SiteBranding />
      </SiteProvider>
    );

    expect(container.querySelector("style")).toBeNull();
    expect(container.querySelector("[data-site-branding]")).toBeNull();
  });

  it("strips dangerous values via the CSS sanitizer", () => {
    const site = makeSite({
      branding: { colors: { primary: "url(javascript:alert(1))" }, style: { borderRadius: "pill" } },
    } as Partial<Site>);

    const { container } = render(
      <SiteProvider site={site}>
        <SiteBranding />
      </SiteProvider>
    );

    const css = container.querySelector("style")?.textContent ?? "";
    expect(css).not.toContain("javascript:");
    expect(css).toContain("--radius: 1rem;");
  });
});
