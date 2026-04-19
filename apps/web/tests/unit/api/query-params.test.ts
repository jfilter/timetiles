/**
 * Unit tests for API route query parameter parsing.
 *
 * Verifies repeated query keys survive parsing so Zod preprocessors can
 * correctly coerce array-style filters from external API clients.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";
import "@/tests/mocks/services/site-resolver";

const mocks = vi.hoisted(() => ({ mockGetPayload: vi.fn() }));

vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { apiRoute } from "@/lib/api/handler";
import { DatasetsParamSchema } from "@/lib/schemas/common";

describe.sequential("apiRoute query parsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGetPayload.mockResolvedValue({ auth: vi.fn().mockResolvedValue({ user: null }) });
  });

  it("preserves repeated query keys for array preprocessors", async () => {
    const route = apiRoute({
      auth: "none",
      query: z.object({ datasets: DatasetsParamSchema.optional() }),
      handler: ({ query }) => ({ datasets: query.datasets ?? [] }),
    });

    const response = await route(new NextRequest("http://localhost/api/test?datasets=1&datasets=2&datasets=3"), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ datasets: [1, 2, 3] });
  });

  it("supports mixed repeated and comma-separated array values", async () => {
    const route = apiRoute({
      auth: "none",
      query: z.object({ datasets: DatasetsParamSchema.optional() }),
      handler: ({ query }) => ({ datasets: query.datasets ?? [] }),
    });

    const response = await route(new NextRequest("http://localhost/api/test?datasets=1,2&datasets=3"), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ datasets: [1, 2, 3] });
  });
});
