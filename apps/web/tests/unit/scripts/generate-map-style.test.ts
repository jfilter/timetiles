/**
 * Regression coverage for the dark-mode label halo in generate-map-style.ts.
 *
 * VersaTiles hardcodes `rgba(255,255,255,0.8)` as text-halo-color on nearly
 * every place/street label; unreplaced, that literal survives untouched into
 * every generated variant. In light mode it happens to be the right polarity
 * (light halo behind dark text); in dark mode it left a light halo behind the
 * now-light text — same polarity, so it stopped separating labels from the
 * basemap instead of framing them. These tests assert the resolved paint
 * values and the WCAG contrast they produce; they cannot confirm how the map
 * actually renders.
 *
 * @module
 * @category Tests
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createColorReplacements, darkMapColors, lightMapColors } from "@/scripts/generate-map-style";

// The literal VersaTiles hardcodes as text-halo-color on nearly every label.
const UPSTREAM_HALO_LITERAL = "rgba(255,255,255,0.8)";
// Same color, expressed as #RRGGBBAA — what an unmatched literal would resolve to.
const UPSTREAM_HALO_HEX8 = "#ffffffcc";

/** WCAG relative luminance of an opaque sRGB hex color. */
const relativeLuminance = (hex: string): number => {
  const channels = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);
  const linearize = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = channels.map(linearize) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio between two opaque sRGB hex colors. */
const contrastRatio = (a: string, b: string): number => {
  const lighter = Math.max(relativeLuminance(a), relativeLuminance(b));
  const darker = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (lighter + 0.05) / (darker + 0.05);
};

/** Alpha-composites an #RRGGBBAA color over an opaque #RRGGBB backdrop. */
const compositeOverBackground = (foregroundHex8: string, backgroundHex6: string): string => {
  const alpha = parseInt(foregroundHex8.slice(7, 9), 16) / 255;
  const blend = (i: number) => {
    const fg = parseInt(foregroundHex8.slice(1 + i, 3 + i), 16);
    const bg = parseInt(backgroundHex6.slice(1 + i, 3 + i), 16);
    return Math.round(fg * alpha + bg * (1 - alpha));
  };
  return `#${[0, 2, 4].map((i) => blend(i).toString(16).padStart(2, "0")).join("")}`;
};

describe("generate-map-style label halo", () => {
  it("resolves the VersaTiles halo literal through the dark-mode textHalo token", () => {
    const replacements = createColorReplacements(darkMapColors);
    expect(replacements[UPSTREAM_HALO_LITERAL]).toBe(`${darkMapColors.textHalo}cc`);
  });

  it("resolves the VersaTiles halo literal through the light-mode textHalo token", () => {
    const replacements = createColorReplacements(lightMapColors);
    expect(replacements[UPSTREAM_HALO_LITERAL]).toBe(`${lightMapColors.textHalo}cc`);
  });

  it("would have left a same-polarity, low-contrast halo had the literal gone unmatched", () => {
    // Reproduces the defect: the raw upstream literal composited over the dark
    // basemap, exactly what shipped before this replacement key existed.
    const unfixedHaloOverLand = compositeOverBackground(UPSTREAM_HALO_HEX8, darkMapColors.land);
    expect(contrastRatio(unfixedHaloOverLand, darkMapColors.textPrimary)).toBeLessThan(2);
  });

  it("gives dark-mode labels a halo of opposite polarity to the text, clearing WCAG AAA", () => {
    const replacements = createColorReplacements(darkMapColors);
    const resolvedHalo = replacements[UPSTREAM_HALO_LITERAL]!;
    const compositedOverLand = compositeOverBackground(resolvedHalo, darkMapColors.land);

    // WCAG AAA for normal text is 7:1; the fixed halo clears it by a wide margin.
    expect(contrastRatio(compositedOverLand, darkMapColors.textPrimary)).toBeGreaterThan(7);
    expect(contrastRatio(compositedOverLand, darkMapColors.textSecondary)).toBeGreaterThan(7);
  });

  it("leaves the light-mode halo effectively unchanged (light halo behind dark text)", () => {
    const replacements = createColorReplacements(lightMapColors);
    const resolvedHalo = replacements[UPSTREAM_HALO_LITERAL]!;
    const compositedOverLand = compositeOverBackground(resolvedHalo, lightMapColors.land);

    expect(contrastRatio(compositedOverLand, lightMapColors.textPrimary)).toBeGreaterThan(7);
  });

  it("ships the fixed, opposite-polarity halo in the committed dark style JSON", () => {
    const stylePath = path.join(process.cwd(), "public/map-styles/cartographic-dark.json");
    const style = JSON.parse(readFileSync(stylePath, "utf-8")) as {
      layers: Array<{ id: string; paint?: Record<string, unknown> }>;
    };
    const cityLabel = style.layers.find((l) => l.id === "label-place-city");

    expect(cityLabel?.paint?.["text-color"]).toBe(darkMapColors.textPrimary);
    expect(cityLabel?.paint?.["text-halo-color"]).toBe(`${darkMapColors.textHalo}cc`);
    expect(cityLabel?.paint?.["text-halo-color"]).not.toBe(UPSTREAM_HALO_LITERAL);
  });
});
