// @vitest-environment jsdom
/**
 * Tests for the CMS page frame: landmarks per layout template variant.
 *
 * @module
 * @category Unit Tests
 */
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { contentMaxWidthClass, LayoutFrame, MAIN_CONTENT_ID } from "@/components/layout/layout-frame";
import type { LayoutSettings } from "@/lib/services/resolution/layout-resolver";

const baseLayout: LayoutSettings = {
  headerVariant: "marketing",
  stickyHeader: true,
  footerVariant: "full",
  contentMaxWidth: "lg",
};

const renderFrame = (layout: LayoutSettings | null) =>
  render(
    <LayoutFrame
      layout={layout}
      header={<header>Site header</header>}
      fullFooter={<footer>Full footer</footer>}
      compactFooter={<footer>Compact footer</footer>}
      skipLinkLabel="Skip to main content"
    >
      <p>Page content</p>
    </LayoutFrame>
  );

afterEach(cleanup);

const expectSkipLinkToMain = () => {
  const main = screen.getByRole("main");
  expect(main).toHaveAttribute("id", MAIN_CONTENT_ID);
  expect(main).toHaveAttribute("tabindex", "-1");
  expect(main).toHaveTextContent("Page content");
  expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", `#${MAIN_CONTENT_ID}`);
};

describe("LayoutFrame", () => {
  it("renders the platform default: header, main and full footer", () => {
    renderFrame(null);

    expect(screen.getByRole("banner")).toHaveTextContent("Site header");
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Full footer");
    expectSkipLinkToMain();
  });

  it.each(["marketing", "app", "minimal"] as const)("renders the header for the %s variant", (headerVariant) => {
    renderFrame({ ...baseLayout, headerVariant });

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expectSkipLinkToMain();
  });

  it("omits the header for the none variant but keeps the skip link and main landmark", () => {
    renderFrame({ ...baseLayout, headerVariant: "none" });

    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expectSkipLinkToMain();
  });

  it.each([
    { footerVariant: "full", text: "Full footer" },
    { footerVariant: "compact", text: "Compact footer" },
  ] as const)("renders exactly one $footerVariant footer", ({ footerVariant, text }) => {
    renderFrame({ ...baseLayout, footerVariant });

    expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
    expect(screen.getByRole("contentinfo")).toHaveTextContent(text);
  });

  it("omits the footer for the none variant", () => {
    renderFrame({ ...baseLayout, footerVariant: "none" });

    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
    expectSkipLinkToMain();
  });
});

describe("contentMaxWidthClass", () => {
  it.each([
    ["sm", "max-w-3xl"],
    ["md", "max-w-5xl"],
    ["lg", "max-w-6xl"],
    ["xl", "max-w-7xl"],
    ["full", ""],
  ] as const)("maps %s to %j", (width, expected) => {
    expect(contentMaxWidthClass(width)).toBe(expected);
  });
});
