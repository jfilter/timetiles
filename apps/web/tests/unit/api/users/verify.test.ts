/**
 * Unit tests for the email verification route with TTL enforcement.
 *
 * Covers the 24-hour expiry gate in front of Payload's built-in `verifyEmail`.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";
import "@/tests/mocks/services/site-resolver";

const mocks = vi.hoisted(() => {
  const mockPayload = { auth: vi.fn(), find: vi.fn(), verifyEmail: vi.fn() };
  return { mockPayload, mockGetPayload: vi.fn().mockResolvedValue(mockPayload) };
});

vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));

import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/users/verify/[token]/route";

const { mockPayload } = mocks;

const createRequest = () =>
  new Request("http://localhost/api/users/verify/abc123", { method: "POST" }) as unknown as NextRequest;

// oxlint-disable-next-line promise/prefer-await-to-then
const createContext = (token: string) => ({ params: Promise.resolve({ token }) });

beforeEach(() => {
  mockPayload.auth.mockReset().mockResolvedValue({ user: null });
  mockPayload.find.mockReset();
  mockPayload.verifyEmail.mockReset().mockResolvedValue(true);
});

describe.sequential("POST /api/users/verify/[token]", () => {
  it("verifies successfully when token is valid and not expired", async () => {
    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mockPayload.find.mockResolvedValue({ docs: [{ id: 1, _verificationTokenExpiresAt: futureExpiry }] });

    const response = await POST(createRequest(), createContext("valid-token") as never);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(mockPayload.verifyEmail).toHaveBeenCalledWith({ collection: "users", token: "valid-token" });
  });

  it("rejects with 400 when token is expired", async () => {
    const pastExpiry = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    mockPayload.find.mockResolvedValue({ docs: [{ id: 1, _verificationTokenExpiresAt: pastExpiry }] });

    const response = await POST(createRequest(), createContext("expired-token") as never);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Token expired");
    expect(mockPayload.verifyEmail).not.toHaveBeenCalled();
  });

  it("rejects with 400 when no user matches the token", async () => {
    mockPayload.find.mockResolvedValue({ docs: [] });

    const response = await POST(createRequest(), createContext("unknown-token") as never);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Token expired");
    expect(mockPayload.verifyEmail).not.toHaveBeenCalled();
  });

  it("rejects with 400 when user has no expiry timestamp (pre-TTL legacy)", async () => {
    mockPayload.find.mockResolvedValue({ docs: [{ id: 1, _verificationTokenExpiresAt: null }] });

    const response = await POST(createRequest(), createContext("legacy-token") as never);

    expect(response.status).toBe(400);
    expect(mockPayload.verifyEmail).not.toHaveBeenCalled();
  });

  it("rejects with 422 when the token is empty", async () => {
    const response = await POST(createRequest(), createContext("") as never);

    // Zod param validation fails → 422
    expect(response.status).toBe(422);
    expect(mockPayload.find).not.toHaveBeenCalled();
    expect(mockPayload.verifyEmail).not.toHaveBeenCalled();
  });
});
