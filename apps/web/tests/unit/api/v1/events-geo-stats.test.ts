/**
 * Unit tests for the events geo stats API route.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";
import "@/tests/mocks/services/site-resolver";

const mocks = vi.hoisted(() => ({
  mockGetPayload: vi.fn(),
  mockCanAccessCatalog: vi.fn(),
  mockDrizzleExecute: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({}));

vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));

vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));

vi.mock("@/lib/services/access-control", () => ({ canAccessCatalog: mocks.mockCanAccessCatalog }));

vi.mock("@payloadcms/db-postgres", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ type: "sql", strings: Array.from(strings), values }),
    {
      join: vi.fn((parts: unknown[], separator: unknown) => ({ type: "join", parts, separator })),
      raw: vi.fn((value: string) => ({ type: "raw", value })),
    }
  ),
}));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/v1/events/geo/stats/route";
import type { AuthenticatedRequest } from "@/lib/middleware/auth";

const createRequest = (queryString: string, user: unknown = null) => {
  const url = `http://localhost:3000/api/v1/events/geo/stats${queryString}`;
  return { user, url, headers: new Headers(), nextUrl: new URL(url) } as unknown as AuthenticatedRequest;
};

describe.sequential("GET /api/v1/events/geo/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.mockGetPayload.mockResolvedValue({
      auth: vi.fn().mockResolvedValue({ user: null }),
      db: { drizzle: { execute: mocks.mockDrizzleExecute } },
    });
    mocks.mockCanAccessCatalog.mockResolvedValue(true);
    mocks.mockDrizzleExecute.mockResolvedValue({
      rows: [{ p20: 2, p40: 5, p60: 10, p80: 20, p100: 50, total_clusters: 1 }],
    });
  });

  it("returns default stats when all dataset ids are invalid", async () => {
    // "abc" cannot be coerced to an integer -- Zod returns a 422 validation error
    const response = await GET(createRequest("?datasets=abc"), { params: Promise.resolve({}) });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error).toBe("Validation failed");
    expect(mocks.mockDrizzleExecute).not.toHaveBeenCalled();
  });
});
