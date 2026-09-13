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
import { validateCustomHeaders } from "@/lib/ingest/validate-custom-headers";
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

describe("URL authentication configuration", () => {
  it.each(["東京", "😀"])("rejects custom header values incompatible with Fetch (%s)", (value) => {
    expect(() => new Headers({ "X-Test": value })).toThrow(TypeError);
    expect(validateCustomHeaders({ "X-Test": value })).toEqual({
      ok: false,
      error: 'customHeaders value for "X-Test" contains characters outside the HTTP byte range',
    });
  });

  it("accepts byte-range custom header values supported by Fetch", () => {
    const headers = { "X-Test": "ä" };
    expect(() => new Headers(headers)).not.toThrow();
    expect(validateCustomHeaders(headers)).toEqual({ ok: true, headers });
  });

  it.each([undefined, null, "X-Custom-Key"])("resolves API key header name %s", async (apiKeyHeader) => {
    const headers = await buildAuthHeaders({ type: "api-key", apiKey: TEST_CREDENTIALS.apiKey.key, apiKeyHeader });
    expect(headers).toEqual({
      "User-Agent": "TimeTiles/1.0 (Data Import Service)",
      [apiKeyHeader ?? "X-API-Key"]: TEST_CREDENTIALS.apiKey.key,
    });
  });

  it.each(["Host", "transfer-encoding", "Connection", "Proxy-Authorization"])(
    "rejects the reserved hop-by-hop header %s",
    (name) => {
      expect(validateCustomHeaders({ [name]: "value" })).toEqual({
        ok: false,
        error: `customHeaders may not set "${name}" (reserved/hop-by-hop)`,
      });
    }
  );

  it("drops invalid custom headers at request time while keeping authentication", async () => {
    const headers = await buildAuthHeaders({
      type: "bearer",
      bearerToken: TEST_CREDENTIALS.bearer.token,
      customHeaders: { Host: "evil.example", "X-Custom": "value" },
    });
    expect(headers).toEqual({
      "User-Agent": "TimeTiles/1.0 (Data Import Service)",
      Authorization: `Bearer ${TEST_CREDENTIALS.bearer.token}`,
    });
  });

  it("does not expose malformed custom header contents in validation errors", () => {
    expect(validateCustomHeaders(TEST_CREDENTIALS.bearer.token)).toEqual({
      ok: false,
      error: "customHeaders is not valid JSON",
    });
  });

  it.each([
    { type: "bearer" as const },
    { type: "api-key" as const, apiKeyHeader: "X-API-Key" },
    { type: "api-key" as const, apiKey: TEST_CREDENTIALS.apiKey.key, apiKeyHeader: "" },
  ])("rejects incomplete %s authentication instead of returning anonymous headers", async (config) => {
    await expect(buildAuthHeaders(config)).rejects.toThrow(/requires/);
  });
});
