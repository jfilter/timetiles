/**
 * Tests for the CMS block renderer.
 *
 * Two regressions are guarded here:
 *
 * 1. Block Style padding classes were assembled at runtime
 *    (`"py-16".replace("py-", "pt-")`). The rendered markup looked right, but
 *    Tailwind only emits utilities it finds as literal text while scanning the
 *    source, so `pt-16` / `pb-24` were never in the stylesheet and the padding
 *    setting was a silent no-op. The literal-source assertions below are the
 *    ones that catch that class of bug — a DOM assertion alone cannot.
 * 2. The Hero block's `background` select mapped "gradient" onto "grid", so
 *    both CMS options rendered identically.
 *
 * @module
 * @category Tests
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BlockRenderer } from "@/components/block-renderer";
import { blockStyleFields } from "@/lib/blocks/block-style-fields";
import type { Block } from "@/lib/types/cms-blocks";

import { renderWithProviders } from "../../setup/unit/react-render";

const BLOCK_RENDERER_SOURCE = readFileSync(join(process.cwd(), "components", "block-renderer.tsx"), "utf8");

/** Assert a Tailwind utility appears verbatim (whole token) in the scanned source. */
const containsLiteralClass = (source: string, className: string): boolean =>
  new RegExp(`(^|[^\\w:/.-])${className.replaceAll("-", "\\-")}([^\\w-]|$)`).test(source);

/** Pull the select option values for a Block Style field out of the Payload config. */
const optionValuesFor = (fieldName: string): string[] => {
  const groupFields = "fields" in blockStyleFields ? blockStyleFields.fields : [];
  for (const field of groupFields) {
    const candidates = "fields" in field && Array.isArray(field.fields) ? field.fields : [field];
    for (const candidate of candidates) {
      if ("name" in candidate && candidate.name === fieldName && "options" in candidate) {
        return (candidate.options as { value: string }[]).map((option) => option.value);
      }
    }
  }
  return [];
};

const heroBlock = (overrides: Partial<Block> = {}): Block =>
  ({ blockType: "hero", id: "hero-1", title: "Headline", ...overrides }) as unknown as Block;

describe("BlockRenderer block style padding", () => {
  it("emits every padding class as a literal string Tailwind can scan", () => {
    const paddingTopOptions = optionValuesFor("paddingTop");
    const paddingBottomOptions = optionValuesFor("paddingBottom");

    expect(paddingTopOptions).toEqual(["none", "sm", "md", "lg", "xl"]);
    expect(paddingBottomOptions).toEqual(["none", "sm", "md", "lg", "xl"]);

    const expectedTop = ["pt-0", "pt-4", "pt-8", "pt-16", "pt-24"];
    const expectedBottom = ["pb-0", "pb-4", "pb-8", "pb-16", "pb-24"];

    expect(expectedTop).toHaveLength(paddingTopOptions.length);
    expect(expectedBottom).toHaveLength(paddingBottomOptions.length);

    for (const className of [...expectedTop, ...expectedBottom]) {
      expect(
        containsLiteralClass(BLOCK_RENDERER_SOURCE, className),
        `${className} must appear literally in block-renderer.tsx or Tailwind will not generate it`
      ).toBe(true);
    }
  });

  it("emits every max-width class as a literal string Tailwind can scan", () => {
    const maxWidthOptions = optionValuesFor("maxWidth");
    expect(maxWidthOptions).toEqual(["sm", "md", "lg", "xl", "full"]);

    for (const className of ["max-w-3xl", "max-w-5xl", "max-w-6xl", "max-w-7xl", "max-w-full"]) {
      expect(
        containsLiteralClass(BLOCK_RENDERER_SOURCE, className),
        `${className} must appear literally in block-renderer.tsx or Tailwind will not generate it`
      ).toBe(true);
    }
  });

  it("never derives a padding class by rewriting another utility at runtime", () => {
    expect(BLOCK_RENDERER_SOURCE).not.toMatch(/replace\(\s*["']py-/);
  });

  it("applies the configured padding to the block wrapper", () => {
    const { container } = renderWithProviders(
      <BlockRenderer blocks={[heroBlock({ blockStyle: { paddingTop: "lg", paddingBottom: "xl" } })]} />
    );

    const wrapper = container.querySelector('[data-block-type="hero"]');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain("pt-16");
    expect(wrapper?.className).toContain("pb-24");
  });
});

describe("BlockRenderer hero background", () => {
  it("renders the gradient and grid options differently", () => {
    const gradient = renderWithProviders(<BlockRenderer blocks={[heroBlock({ background: "gradient" })]} />);
    const gradientClass = gradient.container.querySelector("section")?.className ?? "";

    const grid = renderWithProviders(<BlockRenderer blocks={[heroBlock({ background: "grid" })]} />);
    const gridClass = grid.container.querySelector("section")?.className ?? "";

    expect(gradientClass).not.toBe("");
    expect(gridClass).not.toBe("");
    expect(gradientClass).not.toBe(gridClass);
    expect(gradientClass).toContain("bg-gradient-to-b");
  });

  it("defaults to the grid background when unset", () => {
    const { container } = renderWithProviders(<BlockRenderer blocks={[heroBlock()]} />);
    expect(container.querySelector("section")?.className).toContain("bg-background");
  });
});
