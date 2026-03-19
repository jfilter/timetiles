/**
 * Sanitizes user-provided HTML to prevent XSS attacks.
 *
 * Uses an allowlist approach via `sanitize-html` to permit common
 * analytics and tracking patterns (external scripts, meta tags, tracking
 * pixels) while stripping inline scripts and dangerous attributes.
 *
 * Used for custom HTML injection in the Sites customCode feature.
 *
 * @module
 * @category Security
 */
import sanitize from "sanitize-html";

/**
 * Allowlist configuration for site custom HTML.
 *
 * Permits external analytics scripts (`<script src="...">`) but blocks
 * inline scripts (`<script>alert('xss')</script>`). Also allows meta tags,
 * link elements, tracking pixels, iframes, and structural containers.
 */
const CUSTOM_HTML_OPTIONS: sanitize.IOptions = {
  // script/style are "vulnerable tags" in sanitize-html — opt in explicitly
  allowVulnerableTags: true,

  allowedTags: [
    // Analytics & tracking (only external scripts via exclusiveFilter below)
    "script",
    "noscript",
    // Head elements
    "meta",
    "link",
    // Tracking pixels & embeds
    "img",
    "iframe",
    // Structural (tag manager containers, noscript fallback content)
    "div",
    "span",
    "p",
    "style",
  ],

  allowedAttributes: {
    script: ["src", "async", "defer", "type", "crossorigin", "integrity", "nonce"],
    meta: ["name", "content", "charset", "http-equiv", "property"],
    link: ["rel", "href", "type", "crossorigin", "as", "media"],
    img: ["src", "alt", "width", "height", "loading", "decoding", "referrerpolicy"],
    iframe: ["src", "sandbox", "width", "height", "loading", "allow", "title", "referrerpolicy", "style"],
    div: ["id", "class", "style"],
    span: ["id", "class", "style"],
    p: ["id", "class", "style"],
    style: [],
  },

  // Strip inline script content — only allow <script src="..."></script>
  exclusiveFilter: (frame) => frame.tag === "script" && !frame.attribs["src"],

  allowedSchemes: ["https", "http"],
  allowedSchemesAppliedToAttributes: ["src", "href"],
};

/**
 * Sanitize user-provided HTML by removing dangerous patterns.
 *
 * Allows external analytics scripts, meta tags, tracking pixels, and
 * structural elements. Strips inline scripts, event handlers, and
 * dangerous attributes.
 *
 * @param html - Raw HTML string from the CMS
 * @returns Sanitized HTML string safe for injection
 */
export const sanitizeHTML = (html: string): string => sanitize(html, CUSTOM_HTML_OPTIONS);
