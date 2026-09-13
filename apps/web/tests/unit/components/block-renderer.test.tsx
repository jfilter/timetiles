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
 * 3. Block Style `backgroundColor` is free text placed into an inline style,
 *    so anything but a single colour value must be rejected.
 *
 * @module
 * @category Tests
 */
import "@/lib/blocks";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BlockRenderer } from "@/components/block-renderer";
import { blockStyleFields } from "@/lib/blocks/block-style-fields";
import { getPayloadBlocks } from "@/lib/blocks/registry";
import type { Block } from "@/lib/types/cms-blocks";

import en from "../../../messages/en.json";
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

/** The Block Style `backgroundColor` field's validate function from the Payload config. */
const backgroundColorValidate = () => {
  const groupFields = "fields" in blockStyleFields ? blockStyleFields.fields : [];
  const field = groupFields.find((candidate) => "name" in candidate && candidate.name === "backgroundColor");
  if (!field || !("validate" in field) || typeof field.validate !== "function") throw new Error("validate missing");
  const validate = field.validate as (value: string) => true | string;
  return (value: string) => validate(value);
};

/** The hero block's `background` select default from the registered block config. */
const heroBackgroundDefault = (): unknown => {
  const hero = getPayloadBlocks().find((block) => block.slug === "hero");
  const field = hero?.fields.find((candidate) => "name" in candidate && candidate.name === "background");
  return field && "defaultValue" in field ? field.defaultValue : undefined;
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
  it("preserves block elements when CMS IDs are reordered", () => {
    const first = heroBlock({ id: "first", title: "First block" });
    const second = heroBlock({ id: "second", title: "Second block" });
    const { container, rerender } = renderWithProviders(<BlockRenderer blocks={[first, second]} />);
    const original = Array.from(container.querySelectorAll("section"));
    expect(original).toHaveLength(2);

    rerender(<BlockRenderer blocks={[second, first]} />);

    const reordered = container.querySelectorAll("section");
    expect(reordered[0]).toBe(original[1]);
    expect(reordered[1]).toBe(original[0]);
  });

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

  it("renders the field's default background when unset", () => {
    expect(heroBackgroundDefault()).toBe("gradient");

    const unset = renderWithProviders(<BlockRenderer blocks={[heroBlock()]} />);
    const explicit = renderWithProviders(<BlockRenderer blocks={[heroBlock({ background: "gradient" })]} />);
    expect(unset.container.querySelector("section")?.className).toBe(
      explicit.container.querySelector("section")?.className
    );
  });
});

describe("BlockRenderer block background color", () => {
  /** Server-render a hero with the given background, as the page is delivered to browsers. */
  const serverMarkup = (backgroundColor: string) =>
    renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en}>
        <BlockRenderer blocks={[heroBlock({ blockStyle: { backgroundColor } })]} />
      </NextIntlClientProvider>
    );

  it("applies a valid color", () => {
    expect(serverMarkup("#f5f5f5")).toContain('style="background-color:#f5f5f5"');
  });

  it("does not render a value that smuggles extra declarations", () => {
    const markup = serverMarkup("red;position:fixed;inset:0;z-index:9999");
    expect(markup).not.toContain("position:fixed");
    expect(markup).not.toContain("style=");
  });

  it("rejects invalid colors in the field validator", () => {
    const validate = backgroundColorValidate();
    expect(validate("oklch(0.96 0.01 80)")).toBe(true);
    expect(validate("")).toBe(true);
    expect(validate("red;position:fixed")).toEqual(expect.any(String));
  });
});
