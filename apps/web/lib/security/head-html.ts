/**
 * Converts a site's admin-authored custom head HTML into React elements.
 *
 * The Sites `customCode.headHtml` field is documented as "injected into
 * `<head>`", but nothing ever rendered it — the setting was stored, shipped to
 * the client via the site context, and dropped on the floor.
 *
 * Injection cannot use `dangerouslySetInnerHTML`: `<head>` is rendered by React
 * (Next.js streams its own metadata into it), and the only wrapper element we
 * could hang raw HTML off is not valid inside `<head>` — browsers would close
 * the head and relocate the content into `<body>`. So the HTML is parsed and
 * re-emitted as real React elements.
 *
 * Security posture:
 * - The field is admin-only (`customCode` group has `create`/`update` access
 *   restricted to `role === "admin"`) and is sanitized on write by the Sites
 *   `beforeChange` hook. It is sanitized again here on read, so documents
 *   written before the hook existed cannot bypass it.
 * - `sanitizeHTML` drops inline `<script>` outright and only keeps external
 *   scripts that carry both `integrity` and `crossorigin` (SRI).
 * - Only head-legal tags survive this module; attributes are copied through a
 *   per-tag allowlist, so no event handlers or unexpected props can appear.
 * - `<style>` text is additionally run through the CSS sanitizer.
 *
 * @module
 * @category Security
 */
import * as cheerio from "cheerio";
import { createElement, type ReactElement } from "react";

import { sanitizeCSS } from "./css-sanitizer";
import { sanitizeHTML } from "./html-sanitizer";

/**
 * Tags allowed inside `<head>`, mapped to the HTML attributes we forward and
 * the React prop each becomes. Anything outside this table is dropped.
 */
const HEAD_TAG_ATTRIBUTES: Record<string, Record<string, string>> = {
  meta: { name: "name", content: "content", charset: "charSet", "http-equiv": "httpEquiv", property: "property" },
  link: { rel: "rel", href: "href", type: "type", crossorigin: "crossOrigin", as: "as", media: "media" },
  script: {
    src: "src",
    type: "type",
    crossorigin: "crossOrigin",
    integrity: "integrity",
    nonce: "nonce",
    async: "async",
    defer: "defer",
  },
  style: {},
};

/** Attributes that are boolean in HTML and must become `true`, not `""`. */
const BOOLEAN_ATTRIBUTES = new Set(["async", "defer"]);

const buildProps = (tag: string, attribs: Record<string, string>): Record<string, unknown> => {
  const allowed = HEAD_TAG_ATTRIBUTES[tag] ?? {};
  const props: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(attribs)) {
    const propName = allowed[name.toLowerCase()];
    if (!propName) continue;
    props[propName] = BOOLEAN_ATTRIBUTES.has(name.toLowerCase()) ? true : value;
  }

  return props;
};

/**
 * `<style>` is the only tag whose text content is kept. Script bodies are
 * dropped: the sanitizer already removes inline scripts, and re-emitting
 * arbitrary JS text would defeat that guarantee.
 */
const buildStyleElement = (key: string, css: string): ReactElement | null => {
  const sanitized = sanitizeCSS(css);
  if (!sanitized.trim()) return null;
  return createElement("style", { key, dangerouslySetInnerHTML: { __html: sanitized } });
};

/**
 * Parse admin-authored head HTML into React elements safe to render inside
 * `<head>`. Returns an empty array for empty or fully rejected input.
 */
export const buildCustomHeadElements = (html: string | null | undefined): ReactElement[] => {
  if (!html?.trim()) return [];

  const sanitized = sanitizeHTML(html);
  if (!sanitized.trim()) return [];

  const $ = cheerio.load(sanitized, null, false);
  const elements: ReactElement[] = [];

  $.root()
    .children()
    .each((index, node) => {
      const tag = node.tagName?.toLowerCase();
      if (!tag || !(tag in HEAD_TAG_ATTRIBUTES)) return;

      const key = `custom-head-${index}`;
      if (tag === "style") {
        const styleElement = buildStyleElement(key, $(node).text());
        if (styleElement) elements.push(styleElement);
        return;
      }

      // A <script> without src would be an inline script; the sanitizer strips
      // those, but never emit one even if a stored document predates it.
      const props = buildProps(tag, node.attribs);
      if (tag === "script" && typeof props["src"] !== "string") return;

      elements.push(createElement(tag, { key, ...props }));
    });

  return elements;
};
