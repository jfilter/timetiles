/**
 * Tests for custom head HTML injection.
 *
 * Regression: the Sites `customCode.headHtml` field was stored, sanitized on
 * write, and shipped to the client via the site context — but the frontend
 * layout rendered a bare `<head />`, so the setting never took effect.
 *
 * These tests pin both halves: the HTML -> React element conversion, and the
 * fact that the layout actually renders the result into `<head>`.
 *
 * @module
 * @category Tests
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import { buildCustomHeadElements } from "@/lib/security/head-html";

const propsOf = (element: ReactElement): Record<string, unknown> => element.props as Record<string, unknown>;

const tagsOf = (elements: ReactElement[]): unknown[] => elements.map((element) => element.type);

describe("buildCustomHeadElements", () => {
  it("returns nothing for empty input", () => {
    expect(buildCustomHeadElements(undefined)).toEqual([]);
    expect(buildCustomHeadElements(null)).toEqual([]);
    expect(buildCustomHeadElements("   ")).toEqual([]);
  });

  it("converts meta tags into React elements with mapped props", () => {
    const elements = buildCustomHeadElements('<meta name="google-site-verification" content="abc123">');

    expect(tagsOf(elements)).toEqual(["meta"]);
    expect(propsOf(elements[0]!)).toMatchObject({ name: "google-site-verification", content: "abc123" });
  });

  it("maps HTML attribute names onto their React prop names", () => {
    const elements = buildCustomHeadElements(
      '<link rel="preconnect" href="https://fonts.example.com" crossorigin="anonymous">' +
        '<meta http-equiv="x-dns-prefetch-control" content="on">'
    );

    expect(tagsOf(elements)).toEqual(["link", "meta"]);
    expect(propsOf(elements[0]!)).toMatchObject({
      rel: "preconnect",
      href: "https://fonts.example.com",
      crossOrigin: "anonymous",
    });
    expect(propsOf(elements[1]!)).toMatchObject({ httpEquiv: "x-dns-prefetch-control", content: "on" });
  });

  it("keeps external scripts that carry SRI and renders boolean attributes as true", () => {
    const elements = buildCustomHeadElements(
      '<script src="https://cdn.example.com/a.js" integrity="sha384-xyz" crossorigin="anonymous" async></script>'
    );

    expect(tagsOf(elements)).toEqual(["script"]);
    expect(propsOf(elements[0]!)).toMatchObject({
      src: "https://cdn.example.com/a.js",
      integrity: "sha384-xyz",
      crossOrigin: "anonymous",
      async: true,
    });
  });

  it("drops inline scripts entirely", () => {
    const elements = buildCustomHeadElements('<script>alert("xss")</script><meta name="ok" content="1">');

    expect(tagsOf(elements)).toEqual(["meta"]);
  });

  it("drops external scripts without an integrity hash", () => {
    expect(buildCustomHeadElements('<script src="https://evil.example.com/a.js"></script>')).toEqual([]);
  });

  it("never forwards event handler attributes", () => {
    const elements = buildCustomHeadElements(`<meta name="x" content="y" onload="alert(1)">`);

    expect(propsOf(elements[0]!)).not.toHaveProperty("onLoad");
    expect(propsOf(elements[0]!)).not.toHaveProperty("onload");
  });

  it("drops tags that are not valid inside head", () => {
    const elements = buildCustomHeadElements(
      '<div id="gtm">x</div><img src="https://example.com/p.gif"><meta name="keep" content="1">'
    );

    expect(tagsOf(elements)).toEqual(["meta"]);
  });

  it("passes style contents through the CSS sanitizer", () => {
    const elements = buildCustomHeadElements(
      "<style>body { color: red; background: url(javascript:alert(1)); }</style>"
    );

    expect(tagsOf(elements)).toEqual(["style"]);
    const html = (propsOf(elements[0]!)["dangerouslySetInnerHTML"] as { __html: string }).__html;
    expect(html).toContain("color: red");
    expect(html).not.toContain("javascript:");
  });

  it("gives every element a stable key", () => {
    const elements = buildCustomHeadElements('<meta name="a" content="1"><meta name="b" content="2">');

    const keys = elements.map((element) => element.key);
    expect(new Set(keys).size).toBe(elements.length);
    expect(keys.every((key) => typeof key === "string")).toBe(true);
  });
});

describe("frontend layout head wiring", () => {
  it("renders the custom head elements inside <head>", () => {
    const source: string = readFileSync(
      join(process.cwd(), "app", "[locale]", "(frontend)", "layout.tsx"),
      "utf8"
    ) as unknown as string;

    expect(source).toContain("buildCustomHeadElements");
    expect(source).toMatch(/<head>\{customHeadElements\}<\/head>/);
    expect(source).not.toMatch(/<head\s*\/>/);
  });
});
