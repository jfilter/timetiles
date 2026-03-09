/**
 * Unit tests for the events bounds API route.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

const mocks = vi.hoisted(() => ({
  mockGetPayload: vi.fn(),
  mockGetAllAccessibleCatalogIds: vi.fn(),
  mockExtractBaseEventParameters: vi.fn(),
  mockDrizzleExecute: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({
  withOptionalAuth: vi.fn((handler: (...args: unknown[]) => unknown) => handler),
}));

vi.mock("payload", () => ({
  getPayload: mocks.mockGetPayload,
}));

vi.mock("@/lib/services/access-control", () => ({
  getAllAccessibleCatalogIds: mocks.mockGetAllAccessibleCatalogIds,
}));

vi.mock("@/lib/utils/event-params", () => ({
  extractBaseEventParameters: mocks.mockExtractBaseEventParameters,
}));

vi.mock("@payloadcms/db-postgres", () => ({
  sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }), {
    join: vi.fn(),
    raw: vi.fn(),
  }),
}));

vi.mock("@/payload.config", () => ({ default: {} }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/v1/events/bounds/route";
import type { AuthenticatedRequest } from "@/lib/middleware/auth";

const createRequest = (queryString: string, user: unknown = null) =>
  ({
    user,
    nextUrl: new URL(`http://localhost:3000/api/v1/events/bounds${queryString}`),
  }) as unknown as AuthenticatedRequest;

describe.sequential("GET /api/v1/events/bounds", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.mockGetPayload.mockResolvedValue({
      db: { drizzle: { execute: mocks.mockDrizzleExecute } },
    });
    mocks.mockGetAllAccessibleCatalogIds.mockResolvedValue([]);
    mocks.mockExtractBaseEventParameters.mockReturnValue({
      catalog: "",
      datasets: [],
      startDate: null,
      endDate: null,
      fieldFilters: {},
    });
  });

  it("returns an empty result when catalog is blank and no catalogs are accessible", async () => {
    const response = await GET(createRequest("?catalog="), undefined);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      bounds: null,
      count: 0,
    });
    expect(mocks.mockDrizzleExecute).not.toHaveBeenCalled();
  });
});
