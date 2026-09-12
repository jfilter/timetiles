/**
 * Logout must report transport and HTTP failures instead of claiming success.
 *
 * @module
 * @category Tests
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpError } from "@/lib/api/http-error";
import { logoutRequest } from "@/lib/hooks/use-auth-mutations";

describe("logoutRequest", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts to Payload's logout endpoint with session credentials", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ message: "Logged out" }));
    vi.stubGlobal("fetch", fetch);

    await expect(logoutRequest()).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith("/api/users/logout", { method: "POST", credentials: "include" });
  });

  it.each([400, 500, 503])("rejects HTTP %s without claiming the session was cleared", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "Logout failed" }, { status })));

    await expect(logoutRequest()).rejects.toBeInstanceOf(HttpError);
  });

  it("propagates network failures", async () => {
    const error = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));

    await expect(logoutRequest()).rejects.toBe(error);
  });
});
