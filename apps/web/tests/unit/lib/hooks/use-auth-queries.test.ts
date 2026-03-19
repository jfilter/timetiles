/**
 * Unit tests for fetchCurrentUser error discrimination.
 *
 * Verifies that expected auth failures (401/403) are silently swallowed
 * as { user: null }, while server errors and network failures propagate
 * so React Query can surface them.
 *
 * @module
 * @category Tests
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HttpError } from "@/lib/api/http-error";
import { fetchCurrentUser } from "@/lib/hooks/use-auth-queries";

// Mock fetchJson at the module level
const mockFetchJson = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/http-error", async () => {
  const actual = await vi.importActual("@/lib/api/http-error");
  return { ...(actual as Record<string, unknown>), fetchJson: mockFetchJson };
});

describe("fetchCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return user data on successful fetch", async () => {
    const mockUser = { id: 1, email: "test@example.com" };
    mockFetchJson.mockResolvedValue({ user: mockUser });

    const result = await fetchCurrentUser();

    expect(result).toEqual({ user: mockUser });
    expect(mockFetchJson).toHaveBeenCalledWith("/api/users/me", { credentials: "include" });
  });

  it("should return { user: null } for 401 Unauthorized", async () => {
    mockFetchJson.mockRejectedValue(new HttpError(401, "Unauthorized"));

    const result = await fetchCurrentUser();

    expect(result).toEqual({ user: null });
  });

  it("should return { user: null } for 403 Forbidden", async () => {
    mockFetchJson.mockRejectedValue(new HttpError(403, "Forbidden"));

    const result = await fetchCurrentUser();

    expect(result).toEqual({ user: null });
  });

  it("should throw on 500 Internal Server Error", async () => {
    const serverError = new HttpError(500, "Internal Server Error");
    mockFetchJson.mockRejectedValue(serverError);

    await expect(fetchCurrentUser()).rejects.toThrow(serverError);
  });

  it("should throw on 502 Bad Gateway", async () => {
    const gatewayError = new HttpError(502, "Bad Gateway");
    mockFetchJson.mockRejectedValue(gatewayError);

    await expect(fetchCurrentUser()).rejects.toThrow(gatewayError);
  });

  it("should throw on network errors (non-HttpError)", async () => {
    const networkError = new TypeError("Failed to fetch");
    mockFetchJson.mockRejectedValue(networkError);

    await expect(fetchCurrentUser()).rejects.toThrow(networkError);
  });

  it("should throw on 400 Bad Request (not an auth failure)", async () => {
    const badRequest = new HttpError(400, "Bad Request");
    mockFetchJson.mockRejectedValue(badRequest);

    await expect(fetchCurrentUser()).rejects.toThrow(badRequest);
  });
});
