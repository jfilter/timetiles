import { describe, expect, it } from "vitest";

import { assertGitTargetIsPublic } from "../src/lib/ssrf-guard.js";

describe("assertGitTargetIsPublic", () => {
  it.each(["https://[::1]/repo.git", "https://[::ffff:127.0.0.1]/repo.git", "https://[fd00::1]/repo.git"])(
    "blocks the private IPv6 literal in %s",
    async (url) => {
      await expect(assertGitTargetIsPublic(url)).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
    }
  );

  it("blocks a private IPv4 literal", async () => {
    await expect(assertGitTargetIsPublic("https://10.0.0.5/repo.git")).rejects.toMatchObject({ code: "SSRF_BLOCKED" });
  });

  it("allows public IP literals without a DNS lookup", async () => {
    await expect(assertGitTargetIsPublic("https://[2606:4700:4700::1111]/repo.git")).resolves.toBeUndefined();
    await expect(assertGitTargetIsPublic("https://1.1.1.1/repo.git")).resolves.toBeUndefined();
  });
});
