/**
 * Unit tests for scheduled-ingest notification emails.
 *
 * Verifies that both templates build a sensible subject, recipient, and HTML
 * body for the owner of a scheduled ingest that has been auto-disabled.
 *
 * @module
 * @category Tests
 */
const mocks = vi.hoisted(() => ({
  getEnv: vi.fn(() => ({ NEXT_PUBLIC_PAYLOAD_URL: "https://app.example.com" })),
  createLogger: vi.fn(() => ({ info: vi.fn() })),
  logError: vi.fn(),
}));

vi.mock("@/lib/config/env", () => ({ getEnv: mocks.getEnv }));
vi.mock("@/lib/logger", () => ({ createLogger: mocks.createLogger, logError: mocks.logError }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildScheduledIngestAdminUrl,
  sendScheduledIngestConfigInvalidEmail,
  sendScheduledIngestRetriesExhaustedEmail,
} from "@/lib/ingest/scheduled-ingest-emails";
import type { ScheduledIngest } from "@/payload-types";
import { TEST_EMAILS } from "@/tests/constants/test-credentials";

interface MockPayload {
  findGlobal: ReturnType<typeof vi.fn>;
  sendEmail: ReturnType<typeof vi.fn>;
  config: { serverURL: string };
}

const createPayloadMock = (): MockPayload => ({
  findGlobal: vi.fn().mockResolvedValue({ siteName: "Atlas", logoLight: null }),
  sendEmail: vi.fn().mockResolvedValue(undefined),
  config: { serverURL: "https://app.example.com" },
});

const buildCronIngest = (overrides: Partial<ScheduledIngest> = {}): ScheduledIngest =>
  ({
    id: 42,
    name: "Daily Events Import",
    scheduleType: "cron",
    cronExpression: "not-a-cron",
    frequency: null,
    enabled: true,
    ...overrides,
  }) as unknown as ScheduledIngest;

const owner = { email: TEST_EMAILS.user, firstName: "Ada", locale: "en" };

describe("buildScheduledIngestAdminUrl", () => {
  it("builds a clean URL without double slashes", () => {
    expect(buildScheduledIngestAdminUrl("https://app.example.com/", 42)).toBe(
      "https://app.example.com/admin/collections/scheduled-ingests/42"
    );
    expect(buildScheduledIngestAdminUrl("https://app.example.com", 42)).toBe(
      "https://app.example.com/admin/collections/scheduled-ingests/42"
    );
  });

  it("tolerates a null serverURL (falls back to relative path)", () => {
    expect(buildScheduledIngestAdminUrl(null, 42)).toBe("/admin/collections/scheduled-ingests/42");
  });
});

describe.sequential("sendScheduledIngestConfigInvalidEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends an email to the owner with the schedule name, error, and admin link", async () => {
    const payload = createPayloadMock();
    const ingest = buildCronIngest();

    await sendScheduledIngestConfigInvalidEmail(payload as never, owner, ingest, "Unable to calculate next run");

    expect(payload.sendEmail).toHaveBeenCalledTimes(1);
    const call = payload.sendEmail.mock.calls[0]?.[0] as { to: string; subject: string; html: string };

    expect(call.to).toBe(TEST_EMAILS.user);
    expect(call.subject).toContain("Daily Events Import");
    expect(call.subject.toLowerCase()).toContain("invalid configuration");
    // Body surfaces the error + schedule type + admin link
    expect(call.html).toContain("Unable to calculate next run");
    expect(call.html).toContain("cron");
    expect(call.html).toContain("not-a-cron");
    expect(call.html).toContain("https://app.example.com/admin/collections/scheduled-ingests/42");
    // Greeting uses firstName
    expect(call.html).toContain("Ada");
  });

  it("does not throw when sendEmail rejects — safeSendEmail swallows delivery errors", async () => {
    const payload = createPayloadMock();
    payload.sendEmail.mockRejectedValueOnce(new Error("smtp down"));

    await expect(
      sendScheduledIngestConfigInvalidEmail(payload as never, owner, buildCronIngest(), "boom")
    ).resolves.toBeUndefined();
  });
});

describe.sequential("sendScheduledIngestRetriesExhaustedEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends an email with retry counts and last error", async () => {
    const payload = createPayloadMock();
    const ingest = buildCronIngest({
      name: "Hourly Fetch",
      scheduleType: "frequency",
      frequency: "hourly",
      cronExpression: null,
    });

    await sendScheduledIngestRetriesExhaustedEmail(payload as never, owner, ingest, 4, 3, "HTTP 500 from upstream");

    expect(payload.sendEmail).toHaveBeenCalledTimes(1);
    const call = payload.sendEmail.mock.calls[0]?.[0] as { to: string; subject: string; html: string };

    expect(call.to).toBe(TEST_EMAILS.user);
    expect(call.subject).toContain("Hourly Fetch");
    expect(call.subject.toLowerCase()).toContain("too many failures");
    expect(call.html).toContain("HTTP 500 from upstream");
    expect(call.html).toContain("frequency");
    expect(call.html).toContain("hourly");
    expect(call.html).toContain("4");
    expect(call.html).toContain("3");
    expect(call.html).toContain("https://app.example.com/admin/collections/scheduled-ingests/42");
  });
});
