/**
 * Tests for CSS colour validation.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { isCssColor } from "@/lib/utils/css-color";

describe("isCssColor", () => {
  it.each([
    "#fff",
    "#ffff",
    "#f5f5f5",
    "#F5F5F580",
    "rgb(245, 245, 245)",
    "rgba(0 0 0 / 50%)",
    "hsl(120deg 50% 50%)",
    "hsla(0.5turn, 10%, 20%, 0.3)",
    "oklch(0.96 0.01 80)",
    "oklab(0.5 -0.1 +0.1 / none)",
    "red",
    "transparent",
  ])("accepts %s", (value) => {
    expect(isCssColor(value)).toBe(true);
  });

  it.each([
    "",
    "red;position:fixed;inset:0",
    "red; background-image: url(https://evil.example/x.png)",
    "url(https://evil.example/x.png)",
    "rgb(var(--x))",
    "rgb(0,0,0);color:red",
    "#ggg",
    "#12345",
    "light-dark(white, black)",
    "red blue",
    "expression(alert(1))",
  ])("rejects %s", (value) => {
    expect(isCssColor(value)).toBe(false);
  });
});
