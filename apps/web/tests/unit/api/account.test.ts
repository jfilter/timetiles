/**
 * Unit tests for the account API routes.
 *
 * Tests change-email, change-password, delete, delete/cancel,
 * and deletion-summary endpoints.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { TEST_CREDENTIALS, TEST_EMAILS } from "@/tests/constants/test-credentials";

const mocks = vi.hoisted(() => {
  const mockCheckRateLimit = vi.fn();
  const mockCanDeleteUser = vi.fn();
  const mockScheduleDeletion = vi.fn();
  const mockCancelDeletion = vi.fn();
  const mockGetDeletionSummary = vi.fn();

  const mockPayload = {
    auth: vi.fn(),
    login: vi.fn(),
    find: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  };

  return {
    mockPayload,
    mockGetPayload: vi.fn().mockResolvedValue(mockPayload),
    mockCheckRateLimit,
    mockCanDeleteUser,
    mockScheduleDeletion,
    mockCancelDeletion,
    mockGetDeletionSummary,
  };
});

vi.mock("payload", () => ({
  getPayload: mocks.mockGetPayload,
}));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));

vi.mock("@/lib/services/rate-limit-service", () => ({
  getClientIdentifier: vi.fn().mockReturnValue("test-client"),
  getRateLimitService: vi.fn().mockReturnValue({
    checkConfiguredRateLimit: mocks.mockCheckRateLimit,
  }),
  RATE_LIMITS: {
    EMAIL_CHANGE: { windows: [] },
    PASSWORD_CHANGE: { windows: [] },
    ACCOUNT_DELETION: { windows: [] },
    DELETION_PASSWORD_ATTEMPTS: { windows: [] },
  },
}));

vi.mock("@/lib/middleware/auth", () => ({
  withAuth: (handler: any) => async (req: any, ctx: any) => {
    const payload = await mocks.mockGetPayload();
    const { user } = await payload.auth({ headers: req.headers });
    if (!user) {
      const { NextResponse } = await import("next/server");
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    req.user = user;
    return handler(req, ctx);
  },
}));

vi.mock("@/lib/services/account-deletion-service", () => ({
  getAccountDeletionService: vi.fn().mockReturnValue({
    canDeleteUser: mocks.mockCanDeleteUser,
    scheduleDeletion: mocks.mockScheduleDeletion,
    cancelDeletion: mocks.mockCancelDeletion,
    getDeletionSummary: mocks.mockGetDeletionSummary,
  }),
  DELETION_GRACE_PERIOD_DAYS: 7,
}));

import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as changeEmail } from "@/app/api/account/change-email/route";
import { POST as changePassword } from "@/app/api/account/change-password/route";
import { POST as cancelDeletion } from "@/app/api/account/delete/cancel/route";
import { POST as deleteAccount } from "@/app/api/account/delete/route";
import { GET as getDeletionSummary } from "@/app/api/account/deletion-summary/route";

const {
  mockPayload,
  mockCheckRateLimit,
  mockCanDeleteUser,
  mockScheduleDeletion,
  mockCancelDeletion,
  mockGetDeletionSummary,
} = mocks;

const mockUser = {
  id: 1,
  email: TEST_EMAILS.user,
  role: "user",
  deletionStatus: null as string | null,
  deletionScheduledAt: null as string | null,
};

const createJsonRequest = (url: string, body: unknown, method = "POST") => {
  return new Request(url, {
    method,
    headers: new Headers({
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_CREDENTIALS.bearer.token}`,
    }),
    ...(method !== "GET" && { body: JSON.stringify(body) }),
  }) as unknown as NextRequest;
};

const createGetRequest = (url: string) => {
  return new Request(url, {
    method: "GET",
    headers: new Headers({
      Authorization: `Bearer ${TEST_CREDENTIALS.bearer.token}`,
    }),
  }) as unknown as NextRequest;
};

beforeEach(() => {
  mockPayload.auth.mockReset().mockResolvedValue({ user: mockUser });
  mockPayload.login.mockReset().mockResolvedValue({ user: mockUser });
  mockPayload.find.mockReset().mockResolvedValue({ docs: [] });
  mockPayload.update.mockReset().mockResolvedValue({});
  mockPayload.create.mockReset().mockResolvedValue({});

  mockCheckRateLimit.mockReset().mockReturnValue({ allowed: true });
  mockCanDeleteUser.mockReset().mockResolvedValue({ allowed: true });
  mockScheduleDeletion.mockReset().mockResolvedValue({
    deletionScheduledAt: new Date().toISOString(),
    summary: { catalogs: 0, datasets: 0, events: 0 },
  });
  mockCancelDeletion.mockReset().mockResolvedValue(undefined);
  mockGetDeletionSummary.mockReset().mockResolvedValue({
    catalogs: { total: 0, public: 0, private: 0 },
    datasets: { total: 0 },
    events: { total: 0 },
  });
});

describe.sequential("POST /api/account/change-email", () => {
  it("should return 401 when not authenticated", async () => {
    mockPayload.auth.mockResolvedValue({ user: null });

    const request = createJsonRequest("http://localhost/api/account/change-email", {
      newEmail: "new@example.com",
      password: TEST_CREDENTIALS.basic.password,
    });

    const response = await changeEmail(request, undefined as any);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Authentication required");
  });

  it("should return 400 when missing email or password", async () => {
    const request = createJsonRequest("http://localhost/api/account/change-email", {
      newEmail: "",
      password: "",
    });

    const response = await changeEmail(request, undefined as any);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("New email and password are required");
  });

  it("should return 400 for invalid email format", async () => {
    const request = createJsonRequest("http://localhost/api/account/change-email", {
      newEmail: "not-an-email",
      password: TEST_CREDENTIALS.basic.password,
    });

    const response = await changeEmail(request, undefined as any);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid email format");
  });

  it("should return 400 when email is same as current", async () => {
    const request = createJsonRequest("http://localhost/api/account/change-email", {
      newEmail: TEST_EMAILS.user,
      password: TEST_CREDENTIALS.basic.password,
    });

    const response = await changeEmail(request, undefined as any);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("New email must be different from current email");
  });

  it("should return 401 when password verification fails", async () => {
    mockPayload.login.mockRejectedValue(new Error("Invalid credentials"));

    const request = createJsonRequest("http://localhost/api/account/change-email", {
      newEmail: "new@example.com",
      password: TEST_CREDENTIALS.basic.password,
    });

    const response = await changeEmail(request, undefined as any);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Password is incorrect");
  });

  it("should return 400 when email is already in use", async () => {
    mockPayload.find.mockResolvedValue({ docs: [{ id: 2, email: "new@example.com" }] });

    const request = createJsonRequest("http://localhost/api/account/change-email", {
      newEmail: "new@example.com",
      password: TEST_CREDENTIALS.basic.password,
    });

    const response = await changeEmail(request, undefined as any);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Email is already in use");
  });

  it("should successfully change email", async () => {
    const request = createJsonRequest("http://localhost/api/account/change-email", {
      newEmail: "new@example.com",
      password: TEST_CREDENTIALS.basic.password,
    });

    const response = await changeEmail(request, undefined as any);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.newEmail).toBe("new@example.com");
    expect(mockPayload.update).toHaveBeenCalledWith({
      collection: "users",
      id: mockUser.id,
      data: { email: "new@example.com" },
    });
  });

  it("should return 429 when rate limited", async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false });

    const request = createJsonRequest("http://localhost/api/account/change-email", {
      newEmail: "new@example.com",
      password: TEST_CREDENTIALS.basic.password,
    });

    const response = await changeEmail(request, undefined as any);

    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toContain("Too many email change attempts");
  });
});

describe.sequential("POST /api/account/change-password", () => {
  it("should return 400 when missing passwords", async () => {
    const request = createJsonRequest("http://localhost/api/account/change-password", {
      currentPassword: "",
      newPassword: "",
    });

    const response = await changePassword(request, undefined as any);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Current password and new password are required");
  });

  it("should return 400 when new password is too short", async () => {
    const request = createJsonRequest("http://localhost/api/account/change-password", {
      currentPassword: TEST_CREDENTIALS.basic.password,
      newPassword: "short",
    });

    const response = await changePassword(request, undefined as any);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("at least 8 characters");
  });

  it("should return 401 when current password is wrong", async () => {
    mockPayload.login.mockRejectedValue(new Error("Invalid credentials"));

    const request = createJsonRequest("http://localhost/api/account/change-password", {
      currentPassword: TEST_CREDENTIALS.basic.password,
      newPassword: TEST_CREDENTIALS.basic.strongPassword,
    });

    const response = await changePassword(request, undefined as any);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Current password is incorrect");
  });

  it("should successfully change password", async () => {
    const request = createJsonRequest("http://localhost/api/account/change-password", {
      currentPassword: TEST_CREDENTIALS.basic.password,
      newPassword: TEST_CREDENTIALS.basic.strongPassword,
    });

    const response = await changePassword(request, undefined as any);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.message).toBe("Password changed successfully");
    expect(mockPayload.update).toHaveBeenCalledWith({
      collection: "users",
      id: mockUser.id,
      data: { password: TEST_CREDENTIALS.basic.strongPassword },
    });
  });
});

describe.sequential("POST /api/account/delete", () => {
  it("should return 400 when missing password", async () => {
    const request = createJsonRequest("http://localhost/api/account/delete", {
      password: "",
    });

    const response = await deleteAccount(request, undefined as any);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Password is required");
  });

  it("should return 401 when password is wrong", async () => {
    mockPayload.login.mockRejectedValue(new Error("Invalid credentials"));

    const request = createJsonRequest("http://localhost/api/account/delete", {
      password: TEST_CREDENTIALS.basic.password,
    });

    const response = await deleteAccount(request, undefined as any);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Invalid password");
  });

  it("should return 400 when already pending deletion", async () => {
    const pendingUser = {
      ...mockUser,
      deletionStatus: "pending_deletion",
      deletionScheduledAt: new Date().toISOString(),
    };
    mockPayload.auth.mockResolvedValue({ user: pendingUser });

    const request = createJsonRequest("http://localhost/api/account/delete", {
      password: TEST_CREDENTIALS.basic.password,
    });

    const response = await deleteAccount(request, undefined as any);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Deletion already scheduled");
  });

  it("should successfully schedule deletion", async () => {
    const scheduledAt = new Date().toISOString();
    mockScheduleDeletion.mockResolvedValue({
      deletionScheduledAt: scheduledAt,
      summary: { catalogs: 1, datasets: 2, events: 10 },
    });

    const request = createJsonRequest("http://localhost/api/account/delete", {
      password: TEST_CREDENTIALS.basic.password,
    });

    const response = await deleteAccount(request, undefined as any);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain("7 days");
    expect(data.deletionScheduledAt).toBe(scheduledAt);
    expect(mockScheduleDeletion).toHaveBeenCalledWith(mockUser.id);
  });
});

describe.sequential("POST /api/account/delete/cancel", () => {
  it("should return 401 when not authenticated", async () => {
    mockPayload.auth.mockResolvedValue({ user: null });

    const request = createJsonRequest("http://localhost/api/account/delete/cancel", {});

    const response = await cancelDeletion(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Authentication required");
  });

  it("should return 400 when no pending deletion", async () => {
    const request = createJsonRequest("http://localhost/api/account/delete/cancel", {});

    const response = await cancelDeletion(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("No pending deletion to cancel");
  });

  it("should successfully cancel deletion", async () => {
    const pendingUser = {
      ...mockUser,
      deletionStatus: "pending_deletion",
      deletionScheduledAt: new Date().toISOString(),
    };
    mockPayload.auth.mockResolvedValue({ user: pendingUser });

    const request = createJsonRequest("http://localhost/api/account/delete/cancel", {});

    const response = await cancelDeletion(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain("cancelled");
    expect(mockCancelDeletion).toHaveBeenCalledWith(pendingUser.id);
  });
});

describe.sequential("GET /api/account/deletion-summary", () => {
  it("should return summary with deletion status", async () => {
    const mockSummary = {
      catalogs: { total: 3, public: 1, private: 2 },
      datasets: { total: 5 },
      events: { total: 100 },
    };
    mockGetDeletionSummary.mockResolvedValue(mockSummary);
    mockCanDeleteUser.mockResolvedValue({ allowed: true, reason: null });

    const request = createGetRequest("http://localhost/api/account/deletion-summary");

    const response = await getDeletionSummary(request, undefined as any);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.summary).toEqual(mockSummary);
    expect(data.canDelete).toBe(true);
    expect(data.deletionStatus).toBeNull();
    expect(data.deletionScheduledAt).toBeNull();
    expect(mockGetDeletionSummary).toHaveBeenCalledWith(mockUser.id);
    expect(mockCanDeleteUser).toHaveBeenCalledWith(mockUser.id);
  });
});
