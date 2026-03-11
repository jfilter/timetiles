/**
 * Unit tests for the dataset schema inference API route.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

const mocks = vi.hoisted(() => ({
  mockGetPayload: vi.fn(),
  mockInferSchemaFromEvents: vi.fn(),
  mockFindByID: vi.fn(),
}));

vi.mock("@/lib/middleware/auth", () => ({ withAuth: vi.fn((handler: (...args: unknown[]) => unknown) => handler) }));

vi.mock("@/lib/middleware/rate-limit", () => ({ withRateLimit: (handler: any) => handler }));

vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));

vi.mock("@/lib/services/schema-inference-service", () => ({
  SchemaInferenceService: { inferSchemaFromEvents: mocks.mockInferSchemaFromEvents },
}));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/v1/datasets/[id]/schema/infer/route";
import type { AuthenticatedRequest } from "@/lib/middleware/auth";

const createRequest = (user: unknown) =>
  ({ user, json: vi.fn().mockResolvedValue({}) }) as unknown as AuthenticatedRequest;

const createContext = (id: string) => ({ params: { id } as unknown as Promise<{ id: string }> });

describe.sequential("POST /api/v1/datasets/[id]/schema/infer", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.mockFindByID.mockResolvedValue({ id: 1, name: "Dataset 1" });
    mocks.mockGetPayload.mockResolvedValue({
      auth: vi.fn().mockResolvedValue({ user: { id: 1, role: "editor" } }),
      findByID: mocks.mockFindByID,
    });
    mocks.mockInferSchemaFromEvents.mockResolvedValue({
      generated: true,
      message: "Schema generated",
      eventsSampled: 10,
      schema: null,
    });
  });

  it("returns 400 for partially numeric dataset IDs", async () => {
    const response = await POST(createRequest({ id: 1, role: "editor" }), createContext("1abc"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Invalid dataset ID" });
    expect(mocks.mockFindByID).not.toHaveBeenCalled();
    expect(mocks.mockInferSchemaFromEvents).not.toHaveBeenCalled();
  });
});
