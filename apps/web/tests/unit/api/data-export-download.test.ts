/**
 * Unit tests for GET /api/data-exports/[id]/download.
 *
 * Export archives contain the user's complete personal data. The route detects
 * a just-expired export on download and marks it "expired" — but the cleanup
 * job only sweeps records still in "ready", so leaving `filePath` populated and
 * the file on disk orphaned the ZIP forever: the 30-day record purge then
 * removed the only pointer to it.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";
import "@/tests/mocks/services/site-resolver";

import { TEST_CREDENTIALS, TEST_EMAILS } from "@/tests/constants/test-credentials";

const mocks = vi.hoisted(() => ({ mockGetPayload: vi.fn(), mockUnlink: vi.fn(), mockStat: vi.fn() }));

vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("node:fs/promises", () => ({ unlink: mocks.mockUnlink, stat: mocks.mockStat }));
vi.mock("node:fs", async () => {
  // A real Readable so the success path's `Readable.toWeb()` works.
  const { Readable } = await import("node:stream");
  return { createReadStream: vi.fn(() => Readable.from([Buffer.from("zip-bytes")])) };
});

import { NextRequest } from "next/server";
import { getPayload } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { GET } = await import("@/app/api/data-exports/[id]/download/route");

const USER_ID = 1;
const EXPORT_ID = 42;
const FILE_PATH = "/var/exports/timetiles-export-1-2026-01-01-42.zip";

const mockUser = { id: USER_ID, email: TEST_EMAILS.user, role: "user" };

const createMockPayload = (exportRecord: Record<string, unknown> | null) => ({
  auth: vi.fn().mockResolvedValue({ user: mockUser }),
  findByID: vi.fn().mockResolvedValue(exportRecord),
  update: vi.fn().mockResolvedValue({}),
  db: { drizzle: { execute: vi.fn().mockResolvedValue({ rows: [] }) } },
});

const createRequest = () =>
  new NextRequest(`http://localhost/api/data-exports/${EXPORT_ID}/download`, {
    headers: new Headers({ Authorization: `Bearer ${TEST_CREDENTIALS.bearer.token}` }),
  });

// oxlint-disable-next-line promise/prefer-await-to-then
const routeParams = { params: Promise.resolve({ id: String(EXPORT_ID) }) };

describe.sequential("GET /api/data-exports/[id]/download", () => {
  let mockPayload: ReturnType<typeof createMockPayload>;

  const setup = (exportRecord: Record<string, unknown> | null) => {
    mockPayload = createMockPayload(exportRecord);
    mocks.mockGetPayload.mockResolvedValue(mockPayload);
    vi.mocked(getPayload).mockReset();
    vi.mocked(getPayload).mockResolvedValue(mockPayload as never);
    return mockPayload;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockUnlink.mockResolvedValue(undefined);
    mocks.mockStat.mockResolvedValue({ size: 1024 });
  });

  it("clears filePath and unlinks the archive when the export has just expired", async () => {
    const payload = setup({
      id: EXPORT_ID,
      user: USER_ID,
      status: "ready",
      filePath: FILE_PATH,
      expiresAt: "2020-01-01T00:00:00.000Z",
    });

    const response = await GET(createRequest(), routeParams);

    expect(response.status).toBe(410);
    // Two writes, in this order: retire the record, unlink, and only then forget the path.
    // Clearing it in the first write stranded the archive whenever the unlink failed.
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "data-exports", id: EXPORT_ID, data: { status: "expired" } })
    );
    expect(mocks.mockUnlink).toHaveBeenCalledWith(FILE_PATH);
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "data-exports", id: EXPORT_ID, data: { filePath: null } })
    );
  });

  it("keeps filePath when the unlink fails so the cleanup job can retry", async () => {
    const payload = setup({
      id: EXPORT_ID,
      user: USER_ID,
      status: "ready",
      filePath: FILE_PATH,
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    mocks.mockUnlink.mockRejectedValueOnce(Object.assign(new Error("EIO"), { code: "EIO" }));

    const response = await GET(createRequest(), routeParams);

    expect(response.status).toBe(410);
    expect(payload.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { filePath: null } }));
  });

  it("still returns 410 when the unlink fails", async () => {
    // Filesystem trouble must not change the user-visible outcome.
    setup({
      id: EXPORT_ID,
      user: USER_ID,
      status: "ready",
      filePath: FILE_PATH,
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    mocks.mockUnlink.mockRejectedValue(Object.assign(new Error("EACCES"), { code: "EACCES" }));

    const response = await GET(createRequest(), routeParams);

    expect(response.status).toBe(410);
  });

  it("clears the dangling filePath when the archive is missing from disk", async () => {
    const payload = setup({
      id: EXPORT_ID,
      user: USER_ID,
      status: "ready",
      filePath: FILE_PATH,
      expiresAt: "2999-01-01T00:00:00.000Z",
    });
    mocks.mockStat.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const response = await GET(createRequest(), routeParams);

    expect(response.status).toBe(404);
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "failed", filePath: null }) })
    );
  });

  it("does not touch the file for an export that is still valid", async () => {
    setup({
      id: EXPORT_ID,
      user: USER_ID,
      status: "ready",
      filePath: FILE_PATH,
      expiresAt: "2999-01-01T00:00:00.000Z",
    });

    const response = await GET(createRequest(), routeParams);

    expect(response.status).toBe(200);
    expect(mocks.mockUnlink).not.toHaveBeenCalled();
  });

  it("rejects a download for another user's export", async () => {
    setup({ id: EXPORT_ID, user: 999, status: "ready", filePath: FILE_PATH, expiresAt: "2999-01-01T00:00:00.000Z" });

    const response = await GET(createRequest(), routeParams);

    expect(response.status).toBe(403);
    expect(mocks.mockUnlink).not.toHaveBeenCalled();
  });
});
