/**
 * Auth requests preserve transport failures and shared HTTP error messages.
 *
 * @module
 * @category Tests
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpError } from "@/lib/api/http-error";
import { loginRequest, logoutRequest, registerRequest } from "@/lib/hooks/use-auth-mutations";
import { TEST_CREDENTIALS, TEST_EMAILS } from "@/tests/constants/test-credentials";

describe.each([loginRequest, registerRequest])("%s error handling", (request) => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [{ error: "", message: "Please try later" }, "Please try later"],
    [{ errors: [{ message: "Permission denied" }] }, "Permission denied"],
    [{}, "HTTP 429"],
  ])("preserves the shared HTTP error for %j", async (body, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body, { status: 429 })));

    const result = request({ email: TEST_EMAILS.user, password: TEST_CREDENTIALS.auth.secure });
    await expect(result).rejects.toBeInstanceOf(HttpError);
    await expect(result).rejects.toMatchObject({ status: 429, message, body });
  });
});

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
