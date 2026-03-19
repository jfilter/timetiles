/** @module */
import { describe, expect, it } from "vitest";

import { sanitizeCSS } from "@/lib/security/css-sanitizer";

describe("sanitizeCSS", () => {
  describe("existing patterns (should remain blocked)", () => {
    it("strips @import", () => {
      expect(sanitizeCSS("@import url('evil.css');")).toContain("/* removed */");
    });

    it("strips url()", () => {
      expect(sanitizeCSS("background: url(https://evil.com/track);")).toContain("/* removed */");
    });

    it("strips javascript: in CSS", () => {
      expect(sanitizeCSS("background: javascript:alert(1);")).toContain("/* removed */");
    });

    it("strips expression()", () => {
      expect(sanitizeCSS("width: expression(alert(1));")).toContain("/* removed */");
    });

    it("strips behavior:", () => {
      expect(sanitizeCSS("behavior: url(xss.htc);")).toContain("/* removed */");
    });

    it("strips -moz-binding:", () => {
      expect(sanitizeCSS("-moz-binding: url(evil.xml#xss);")).toContain("/* removed */");
    });

    it("strips position: fixed", () => {
      expect(sanitizeCSS("position: fixed;")).toContain("/* removed */");
    });

    it("strips script tags in CSS", () => {
      expect(sanitizeCSS("</style><script>alert(1)</script>")).toContain("/* removed */");
    });
  });

  describe("new patterns", () => {
    it("strips @font-face", () => {
      const css = "@font-face { font-family: probe; src: local('Arial'); }";
      expect(sanitizeCSS(css)).toContain("/* removed */");
      expect(sanitizeCSS(css)).not.toContain("@font-face");
    });

    it("strips content with attr() for data exfiltration", () => {
      const css = ".secret::after { content: attr(data-token); }";
      const result = sanitizeCSS(css);
      expect(result).toContain("/* removed */");
      expect(result).not.toMatch(/content\s*:.*attr\s*\(/);
    });

    it("preserves content with plain strings", () => {
      const css = '.label::before { content: "Hello"; }';
      const result = sanitizeCSS(css);
      expect(result).not.toContain("/* removed */");
      expect(result).toContain("Hello");
    });

    it("strips -webkit-binding:", () => {
      const css = "-webkit-binding: url(evil.xml);";
      expect(sanitizeCSS(css)).toContain("/* removed */");
    });

    it("strips CSS unicode escapes that could bypass other patterns", () => {
      // \6a is 'j' in CSS unicode escape — could bypass "javascript:" check
      const css = "background: \\6a avascript:alert(1);";
      expect(sanitizeCSS(css)).toContain("/* removed */");
    });
  });

  describe("safe CSS preserved", () => {
    it("preserves color declarations", () => {
      const css = "color: #ff0000; background-color: rgb(0, 0, 255);";
      expect(sanitizeCSS(css)).toBe(css);
    });

    it("preserves margin and padding", () => {
      const css = "margin: 10px; padding: 2rem 1rem;";
      expect(sanitizeCSS(css)).toBe(css);
    });

    it("preserves font-size and font-family", () => {
      const css = 'font-size: 16px; font-family: "Helvetica", sans-serif;';
      expect(sanitizeCSS(css)).toBe(css);
    });

    it("preserves border and border-radius", () => {
      const css = "border: 1px solid #ccc; border-radius: 4px;";
      expect(sanitizeCSS(css)).toBe(css);
    });

    it("preserves display and flexbox properties", () => {
      const css = "display: flex; gap: 1rem; align-items: center;";
      expect(sanitizeCSS(css)).toBe(css);
    });

    it("preserves position: relative and absolute", () => {
      const css = "position: relative;";
      expect(sanitizeCSS(css)).toBe(css);
    });
  });
});
