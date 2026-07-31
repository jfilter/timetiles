/**
 * User-scoped cache invalidation must not spill onto other users.
 *
 * The key is `GET:<url>:user:<id>` with an optional `:auth:<fingerprint>` suffix, so the id is
 * a whole segment. Matching it as a bare substring made `invalidateForUser("1")` also delete
 * every entry belonging to users 10-19, 100-199 and so on.
 *
 * @module
 * @category Unit Tests
 */
import { describe, expect, it } from "vitest";

import { belongsToUser } from "@/lib/services/cache/url-fetch-cache";

describe("belongsToUser", () => {
  it("matches the user's own keys, with and without an auth fingerprint", () => {
    expect(belongsToUser("GET:https://a.example/x:user:1", "1")).toBe(true);
    expect(belongsToUser("GET:https://a.example/x:user:1:auth:abc123", "1")).toBe(true);
  });

  it.each(["GET:https://a.example/x:user:10", "GET:https://a.example/x:user:100:auth:abc", "GET:x:user:21"])(
    "does not match another user's key %s",
    (key) => {
      expect(belongsToUser(key, "1")).toBe(false);
    }
  );

  it("is not fooled by the id appearing inside the URL", () => {
    expect(belongsToUser("GET:https://a.example/user/1:user:7", "1")).toBe(false);
  });
});
