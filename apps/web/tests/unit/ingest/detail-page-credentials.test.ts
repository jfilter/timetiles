/**
 * Credentials must not follow a detail-page URL to a foreign host.
 *
 * `htmlExtractConfig.detailPage.urlField` names a field in the FETCHED CONTENT, so the source
 * decides where the enrichment request goes. Forwarding the configured auth headers there
 * unconditionally handed a bearer token or API key to any host a compromised or hostile feed
 * cared to name. safe-fetch already strips credentials across an origin boundary, but only on
 * a redirect — this is the initial hop.
 *
 * @module
 * @category Unit Tests
 */
import { describe, expect, it } from "vitest";

import { isSameOriginForCredentials } from "@/lib/ingest/fetch-remote-data";

describe("detail-page credential scoping", () => {
  it("keeps credentials for the same origin", () => {
    expect(isSameOriginForCredentials("https://feed.example/item/1", "https://feed.example/list")).toBe(true);
    expect(isSameOriginForCredentials("https://feed.example:443/a", "https://feed.example/b")).toBe(true);
  });

  it.each([
    ["a different host", "https://attacker.example/collect", "https://feed.example/list"],
    ["a subdomain", "https://evil.feed.example/x", "https://feed.example/list"],
    ["a different scheme", "http://feed.example/x", "https://feed.example/list"],
    ["a different port", "https://feed.example:8443/x", "https://feed.example/list"],
  ])("withholds credentials for %s", (_label, candidate, reference) => {
    expect(isSameOriginForCredentials(candidate, reference)).toBe(false);
  });

  it("withholds credentials when either URL is unparseable", () => {
    expect(isSameOriginForCredentials("not a url", "https://feed.example/list")).toBe(false);
    expect(isSameOriginForCredentials("https://feed.example/x", "not a url")).toBe(false);
  });
});
