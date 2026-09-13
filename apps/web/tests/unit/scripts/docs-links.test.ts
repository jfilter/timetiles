// @vitest-environment node
/**
 * Regression tests for the repository documentation link checker.
 * @module
 */
import { createServer } from "node:http";

import { describe, expect, it } from "vitest";

import {
  checkExternalLink,
  extractLinks,
  findRepoDocsSiteLinks,
  resolveDocsSiteUrl,
  // eslint-disable-next-line boundaries/dependencies -- Tooling test hosted in the shared Vitest suite, not a web runtime dependency.
} from "../../../../docs/scripts/check-links";

describe("documentation site URLs outside the docs content", () => {
  // Built from parts so the repository scan below never sees a broken literal URL in this file.
  const docsSite = ["https://docs", "timetiles", "io"].join(".");

  it("resolves docs site URLs against the docs content directory", () => {
    expect(resolveDocsSiteUrl(`${docsSite}/development/packages/scrapers`)?.valid).toBe(true);
    expect(resolveDocsSiteUrl(`${docsSite}/reference/does-not-exist`)?.valid).toBe(false);
    expect(resolveDocsSiteUrl(`${docsSite}/development/packages/scrapers.`)?.valid).toBe(true);
    expect(resolveDocsSiteUrl("https://timetiles.io/about")).toBeNull();
  });

  it("finds no broken docs site URL in repository files", () => {
    const broken = findRepoDocsSiteLinks().filter((link) => !resolveDocsSiteUrl(link.url)?.valid);
    expect(broken).toEqual([]);
  });
});

describe("documentation link extraction", () => {
  it("falls back to GET when the server rejects HEAD", async () => {
    const methods: string[] = [];
    const server = createServer((req, res) => {
      methods.push(req.method ?? "");
      res.writeHead(req.method === "HEAD" ? 405 : 200);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected a TCP listener");
      expect(await checkExternalLink(`http://127.0.0.1:${address.port}`)).toEqual({ valid: true });
      expect(methods).toEqual(["HEAD", "GET"]);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("preserves parentheses in angle-bracket Markdown destinations without duplicate partial URLs", () => {
    const url = "https://en.wikipedia.org/wiki/Elbow_method_(clustering)";
    expect(extractLinks(`[elbow detection](<${url}>).`)).toEqual([url]);
  });

  it("keeps Markdown, component, and bare links while ignoring code examples", () => {
    expect(extractLinks('[Guide](./guide) <Link href="/guide" /> https://timetiles.io `https://ignored.test`')).toEqual(
      ["./guide", "/guide", "https://timetiles.io"]
    );
  });
});
