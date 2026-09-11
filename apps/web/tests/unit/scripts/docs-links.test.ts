// @vitest-environment node
/**
 * Regression tests for the repository documentation link checker.
 * @module
 */
import { createServer } from "node:http";

import { describe, expect, it } from "vitest";

// eslint-disable-next-line boundaries/dependencies -- Tooling test hosted in the shared Vitest suite, not a web runtime dependency.
import { checkExternalLink, extractLinks } from "../../../../docs/scripts/check-links";

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
