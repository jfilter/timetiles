/** @module */
import { describe, expect, it } from "vitest";

import { sanitizeCSS } from "@/lib/security/css-sanitizer";

const wrap = (body: string): string => `.site { ${body} }`;

describe("sanitizeCSS", () => {
  describe("dangerous constructs removed", () => {
    it("drops @import at-rules", () => {
      const result = sanitizeCSS("@import url('evil.css'); .safe { color: red; }");
      expect(result).not.toContain("@import");
      expect(result).toContain("color: red");
    });

    it("drops declarations containing url()", () => {
      const result = sanitizeCSS(wrap("background: url(https://evil.com/track); color: red;"));
      expect(result).not.toMatch(/url\s*\(/i);
      expect(result).toContain("color: red");
    });

    it("drops declarations with javascript: value", () => {
      const result = sanitizeCSS(wrap("background: javascript:alert(1); color: red;"));
      expect(result).not.toMatch(/javascript/i);
      expect(result).toContain("color: red");
    });

    it("drops declarations with expression()", () => {
      const result = sanitizeCSS(wrap("width: expression(alert(1)); color: red;"));
      expect(result).not.toMatch(/expression\s*\(/i);
      expect(result).toContain("color: red");
    });

    it("drops behavior:", () => {
      const result = sanitizeCSS(wrap("behavior: url(xss.htc); color: red;"));
      expect(result).not.toMatch(/behavior\s*:/i);
      expect(result).toContain("color: red");
    });

    it("drops -moz-binding and -webkit-binding", () => {
      const moz = sanitizeCSS(wrap("-moz-binding: url(evil.xml#xss);"));
      const wk = sanitizeCSS(wrap("-webkit-binding: url(evil.xml);"));
      expect(moz).not.toMatch(/-moz-binding/i);
      expect(wk).not.toMatch(/-webkit-binding/i);
    });

    it("drops position: fixed and position: sticky", () => {
      expect(sanitizeCSS(wrap("position: fixed;"))).not.toMatch(/position\s*:\s*fixed/i);
      expect(sanitizeCSS(wrap("position: sticky;"))).not.toMatch(/position\s*:\s*sticky/i);
    });

    it("drops content: attr() data exfiltration", () => {
      const result = sanitizeCSS(".secret::after { content: attr(data-token); color: red; }");
      expect(result).not.toMatch(/attr\s*\(/i);
      expect(result).toContain("color: red");
    });

    it("drops @font-face at-rules", () => {
      const result = sanitizeCSS("@font-face { font-family: probe; src: local('Arial'); } .safe { color: red; }");
      expect(result).not.toContain("@font-face");
      expect(result).toContain("color: red");
    });

    it("drops @charset and @namespace at-rules", () => {
      expect(sanitizeCSS("@charset 'utf-8';")).not.toContain("@charset");
      expect(sanitizeCSS('@namespace url("http://x");')).not.toContain("@namespace");
    });

    it("drops declarations with CSS unicode escapes", () => {
      // \6a is 'j' — an attacker can write \6a avascript: to bypass value checks
      const result = sanitizeCSS(wrap("background: \\6a avascript:alert(1); color: red;"));
      expect(result).not.toContain("\\6a");
      expect(result).toContain("color: red");
    });

    it("never emits <script> from a parse failure", () => {
      // Malformed input like HTML should either parse as broken CSS or fail,
      // but never echo <script> into the output.
      const result = sanitizeCSS("</style><script>alert(1)</script>");
      expect(result).not.toContain("<script");
    });
  });

  describe("safe CSS preserved", () => {
    it("preserves color declarations", () => {
      const result = sanitizeCSS(wrap("color: #ff0000; background-color: rgb(0, 0, 255);"));
      expect(result).toContain("color: #ff0000");
      expect(result).toContain("background-color: rgb(0, 0, 255)");
    });

    it("preserves margin and padding", () => {
      const result = sanitizeCSS(wrap("margin: 10px; padding: 2rem 1rem;"));
      expect(result).toContain("margin: 10px");
      expect(result).toContain("padding: 2rem 1rem");
    });

    it("preserves font-size and font-family", () => {
      const result = sanitizeCSS(wrap('font-size: 16px; font-family: "Helvetica", sans-serif;'));
      expect(result).toContain("font-size: 16px");
      expect(result).toContain('font-family: "Helvetica", sans-serif');
    });

    it("preserves border and border-radius", () => {
      const result = sanitizeCSS(wrap("border: 1px solid #ccc; border-radius: 4px;"));
      expect(result).toContain("border: 1px solid #ccc");
      expect(result).toContain("border-radius: 4px");
    });

    it("preserves flex layout", () => {
      const result = sanitizeCSS(wrap("display: flex; gap: 1rem; align-items: center;"));
      expect(result).toContain("display: flex");
      expect(result).toContain("gap: 1rem");
      expect(result).toContain("align-items: center");
    });

    it("preserves position: relative and absolute", () => {
      expect(sanitizeCSS(wrap("position: relative;"))).toContain("position: relative");
      expect(sanitizeCSS(wrap("position: absolute;"))).toContain("position: absolute");
    });

    it("preserves @media and @supports blocks", () => {
      const css = "@media (min-width: 768px) { .site { color: red; } }";
      const result = sanitizeCSS(css);
      expect(result).toContain("@media");
      expect(result).toContain("color: red");
    });

    it("preserves content with plain string values", () => {
      const result = sanitizeCSS('.label::before { content: "Hello"; }');
      expect(result).toContain('"Hello"');
    });
  });

  describe("input hygiene", () => {
    it("returns empty string for empty input", () => {
      expect(sanitizeCSS("")).toBe("");
    });

    it("returns empty string for non-string input", () => {
      expect(sanitizeCSS(null as unknown as string)).toBe("");
      expect(sanitizeCSS(undefined as unknown as string)).toBe("");
    });
  });
});
