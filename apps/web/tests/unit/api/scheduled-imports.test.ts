/**
 * Unit tests for the scheduled-imports/[id] API route.
 *
 * Tests GET, PATCH, and DELETE operations for individual scheduled imports.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { TEST_CREDENTIALS, TEST_EMAILS } from "@/tests/constants/test-credentials";

const mocks = vi.hoisted(() => {
  const mockPayload = {
    auth: vi.fn(),
    findByID: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    jobs: {
      queue: vi.fn(),
    },
  };
  const mockGetPayload = vi.fn().mockResolvedValue(mockPayload);
  return { mockPayload, mockGetPayload };
});

vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));

// Mock withAuth to use our controlled mock payload for authentication
vi.mock("@/lib/middleware/auth", () => ({
  withAuth: (handler: (...args: unknown[]) => unknown) => {
    return async (request: Request, context: unknown) => {
      const payload = await mocks.mockGetPayload();
      try {
        const { user } = await payload.auth({ headers: request.headers });
        if (!user) {
          const { NextResponse } = await import("next/server");
          return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }
        (request as any).user = user;
        return handler(request, context);
      } catch {
        const { NextResponse } = await import("next/server");
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
    };
  },
}));

import type { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { DELETE, GET, PATCH } from "@/app/api/scheduled-imports/[id]/route";
import { POST } from "@/app/api/scheduled-imports/[id]/trigger/route";

const mockUser = { id: 1, email: TEST_EMAILS.user, role: "user" };
const mockAdminUser = { id: 2, email: TEST_EMAILS.admin, role: "admin" };

const mockSchedule = {
  id: 1,
  url: "https://example.com/data.csv",
  enabled: true,
  createdBy: { id: 1, email: TEST_EMAILS.user },
};

const { mockPayload } = mocks;

const createContext = (id: string) => ({
  params: Promise.resolve({ id }),
});

const createRequest = (method: string = "GET", body?: unknown) => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${TEST_CREDENTIALS.bearer.token}`,
  };
  const init: RequestInit = { method, headers };
  if (body) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  return new Request("http://localhost/api/scheduled-imports/1", init) as unknown as NextRequest;
};

/**
 * Sets up default mock implementations for authenticated user scenarios.
 * Must be called at the start of each test since tests run concurrently.
 */
const setupAuthenticatedUser = () => {
  mockPayload.auth.mockResolvedValue({ user: mockUser });
  mockPayload.findByID.mockResolvedValue(mockSchedule);
  mockPayload.update.mockResolvedValue({ ...mockSchedule, enabled: false });
  mockPayload.delete.mockResolvedValue(mockSchedule);
  mockPayload.jobs.queue.mockResolvedValue(undefined);
};

describe.sequential("GET /api/scheduled-imports/[id]", () => {
  it("should return 401 when not authenticated", async () => {
    mockPayload.auth.mockResolvedValue({ user: null });

    const response = await GET(createRequest(), createContext("1"));

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Authentication required");
  });

  it("should return 400 for invalid (non-numeric) ID", async () => {
    setupAuthenticatedUser();

    const response = await GET(createRequest(), createContext("abc"));

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid ID");
  });

  it("should return 400 for partially numeric ID", async () => {
    setupAuthenticatedUser();

    const response = await GET(createRequest(), createContext("1abc"));

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid ID");
    expect(mockPayload.findByID).not.toHaveBeenCalled();
  });

  it("should return 404 when schedule not found", async () => {
    setupAuthenticatedUser();
    mockPayload.findByID.mockResolvedValue(null);

    const response = await GET(createRequest(), createContext("999"));

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Schedule not found");
  });

  it("should return 403 when user does not own the schedule", async () => {
    setupAuthenticatedUser();
    mockPayload.findByID.mockResolvedValue({
      ...mockSchedule,
      createdBy: { id: 99, email: "other@example.com" },
    });

    const response = await GET(createRequest(), createContext("1"));

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe("Forbidden");
  });

  it("should return schedule when user owns it", async () => {
    setupAuthenticatedUser();

    const response = await GET(createRequest(), createContext("1"));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBe(1);
    expect(data.url).toBe("https://example.com/data.csv");
    expect(mockPayload.findByID).toHaveBeenCalledWith({
      collection: "scheduled-imports",
      id: 1,
      depth: 1,
    });
  });

  it("should return schedule when user is admin", async () => {
    setupAuthenticatedUser();
    mockPayload.auth.mockResolvedValue({ user: mockAdminUser });
    mockPayload.findByID.mockResolvedValue({
      ...mockSchedule,
      createdBy: { id: 99, email: "other@example.com" },
    });

    const response = await GET(createRequest(), createContext("1"));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBe(1);
  });
});

describe.sequential("POST /api/scheduled-imports/[id]/trigger", () => {
  it("should return 400 for partially numeric ID", async () => {
    vi.clearAllMocks();
    setupAuthenticatedUser();

    const response = await POST(createRequest("POST"), createContext("1abc"));

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid ID");
    expect(mockPayload.findByID).not.toHaveBeenCalled();
    expect(mockPayload.jobs.queue).not.toHaveBeenCalled();
  });
});

describe.sequential("PATCH /api/scheduled-imports/[id]", () => {
  it("should return 400 for invalid ID", async () => {
    setupAuthenticatedUser();

    const response = await PATCH(createRequest("PATCH", { enabled: false }), createContext("abc"));

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid ID");
  });

  it("should return 404 when schedule not found", async () => {
    setupAuthenticatedUser();
    mockPayload.findByID.mockResolvedValue(null);

    const response = await PATCH(createRequest("PATCH", { enabled: false }), createContext("999"));

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Schedule not found");
  });

  it("should return 403 when user does not own the schedule", async () => {
    setupAuthenticatedUser();
    mockPayload.findByID.mockResolvedValue({
      ...mockSchedule,
      createdBy: { id: 99, email: "other@example.com" },
    });

    const response = await PATCH(createRequest("PATCH", { enabled: false }), createContext("1"));

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe("Forbidden");
  });

  it("should successfully update schedule enabled status", async () => {
    setupAuthenticatedUser();
    const updatedSchedule = { ...mockSchedule, enabled: false };
    mockPayload.update.mockResolvedValue(updatedSchedule);

    const response = await PATCH(createRequest("PATCH", { enabled: false }), createContext("1"));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.doc).toEqual(updatedSchedule);
    expect(mockPayload.update).toHaveBeenCalledWith({
      collection: "scheduled-imports",
      id: 1,
      data: { enabled: false },
    });
  });
});

describe.sequential("DELETE /api/scheduled-imports/[id]", () => {
  it("should return 400 for invalid ID", async () => {
    setupAuthenticatedUser();

    const response = await DELETE(createRequest("DELETE"), createContext("abc"));

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid ID");
  });

  it("should return 404 when schedule not found", async () => {
    setupAuthenticatedUser();
    mockPayload.findByID.mockResolvedValue(null);

    const response = await DELETE(createRequest("DELETE"), createContext("999"));

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Schedule not found");
  });

  it("should return 403 when user does not own the schedule", async () => {
    setupAuthenticatedUser();
    mockPayload.findByID.mockResolvedValue({
      ...mockSchedule,
      createdBy: { id: 99, email: "other@example.com" },
    });

    const response = await DELETE(createRequest("DELETE"), createContext("1"));

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBe("Forbidden");
  });

  it("should successfully delete schedule", async () => {
    setupAuthenticatedUser();

    const response = await DELETE(createRequest("DELETE"), createContext("1"));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(mockPayload.delete).toHaveBeenCalledWith({
      collection: "scheduled-imports",
      id: 1,
    });
  });
});
