// @vitest-environment node
/**
 * Regression tests for the repository documentation link checker.
 * @module
 */
import { describe, expect, it } from "vitest";

// eslint-disable-next-line boundaries/dependencies -- Tooling test hosted in the shared Vitest suite, not a web runtime dependency.
import { extractLinks } from "../../../../docs/scripts/check-links";

describe("documentation link extraction", () => {
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
