/**
 * Regression tests for secret-safe OAuth token exchange diagnostics.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

vi.mock("@/lib/security/safe-fetch", () => ({ safeFetch: vi.fn() }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildAuthHeaders } from "@/lib/ingest/url-fetch/auth";
import { safeFetch } from "@/lib/security/safe-fetch";
import { TEST_CREDENTIALS } from "@/tests/constants/test-credentials";
import { mockLogger } from "@/tests/mocks/services/logger";

const authLogger = mockLogger.createLogger.mock.results[0].value;
const authConfig = {
  type: "oauth" as const,
  tokenUrl: `https://example.com/token?api_key=${TEST_CREDENTIALS.apiKey.secretKey}`,
  username: TEST_CREDENTIALS.basic.username,
  password: TEST_CREDENTIALS.basic.superSecretPassword,
};

describe("OAuth diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([400, 500])("does not read or propagate the token endpoint's error body (%s)", async (status) => {
    const response = new Response(JSON.stringify({ error_description: authConfig.password }), { status });
    const readBody = vi.spyOn(response, "text");
    const cancelBody = vi.spyOn(response.body!, "cancel");
    vi.mocked(safeFetch).mockResolvedValue(response);

    await expect(buildAuthHeaders(authConfig)).rejects.toEqual(new Error(`OAuth token request failed (${status})`));
    expect(readBody).not.toHaveBeenCalled();
    expect(cancelBody).toHaveBeenCalledOnce();
  });

  it("uses the access token without logging the token endpoint URL", async () => {
    vi.mocked(safeFetch).mockResolvedValue(Response.json({ access_token: TEST_CREDENTIALS.bearer.token }));

    expect(await buildAuthHeaders(authConfig)).toMatchObject({
      Authorization: `Bearer ${TEST_CREDENTIALS.bearer.token}`,
    });
    expect(authLogger.debug).not.toHaveBeenCalled();
  });

  it.each([null, {}, { access_token: 42 }, { access_token: {} }, { access_token: "" }, { access_token: "   " }])(
    "rejects an invalid token response without exposing its contents (%j)",
    async (body) => {
      vi.mocked(safeFetch).mockResolvedValue(Response.json(body));
      await expect(buildAuthHeaders(authConfig)).rejects.toEqual(
        new Error("OAuth response missing valid access_token")
      );
    }
  );

  it("does not expose malformed JSON from the token endpoint", async () => {
    vi.mocked(safeFetch).mockResolvedValue(new Response(authConfig.password));
    await expect(buildAuthHeaders(authConfig)).rejects.toEqual(new Error("OAuth response missing valid access_token"));
  });

  it.each(["tokenUrl", "username", "password"] as const)("rejects OAuth configuration without %s", async (field) => {
    await expect(buildAuthHeaders({ ...authConfig, [field]: "" })).rejects.toEqual(
      new Error("OAuth requires a token URL, username and password")
    );
    expect(safeFetch).not.toHaveBeenCalled();
  });
});
