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

import { EMAIL_CONTEXTS } from "@/lib/email/send";
import {
  buildScheduledIngestAdminUrl,
  sendScheduledIngestConfigInvalidEmail,
  sendScheduledIngestRetriesExhaustedEmail,
} from "@/lib/ingest/scheduled-ingest-emails";
import type { ScheduledIngest } from "@/payload-types";
import { TEST_EMAILS } from "@/tests/constants/test-credentials";

interface MockPayload {
  findGlobal: ReturnType<typeof vi.fn>;
  jobs: { queue: ReturnType<typeof vi.fn> };
  config: { serverURL: string };
}

const createPayloadMock = (): MockPayload => ({
  findGlobal: vi.fn().mockResolvedValue({ siteName: "Atlas", logoLight: null }),
  jobs: { queue: vi.fn().mockResolvedValue({ id: "email-job-1" }) },
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

  it("queues an email to the owner with the schedule name, error, and admin link", async () => {
    const payload = createPayloadMock();
    const ingest = buildCronIngest();

    await sendScheduledIngestConfigInvalidEmail(payload as never, owner, ingest, "Unable to calculate next run");

    expect(payload.jobs.queue).toHaveBeenCalledTimes(1);
    const job = payload.jobs.queue.mock.calls[0]?.[0] as {
      task: string;
      input: { to: string; subject: string; html: string; context: string };
      meta: { context: string };
    };

    expect(job.task).toBe("send-email");
    expect(job.input.context).toBe(EMAIL_CONTEXTS.SCHEDULED_INGEST_CONFIG_INVALID);
    expect(job.meta.context).toBe(EMAIL_CONTEXTS.SCHEDULED_INGEST_CONFIG_INVALID);
    expect(job.input.to).toBe(TEST_EMAILS.user);
    expect(job.input.subject).toContain("Daily Events Import");
    expect(job.input.subject.toLowerCase()).toContain("invalid configuration");
    // Body surfaces the error + schedule type + admin link
    expect(job.input.html).toContain("Unable to calculate next run");
    expect(job.input.html).toContain("cron");
    expect(job.input.html).toContain("not-a-cron");
    expect(job.input.html).toContain("https://app.example.com/admin/collections/scheduled-ingests/42");
    // Greeting uses firstName
    expect(job.input.html).toContain("Ada");
  });

  it("does not throw when the queue rejects — queueEmail swallows enqueue errors", async () => {
    const payload = createPayloadMock();
    payload.jobs.queue.mockRejectedValueOnce(new Error("queue unavailable"));

    await expect(
      sendScheduledIngestConfigInvalidEmail(payload as never, owner, buildCronIngest(), "boom")
    ).resolves.toBeUndefined();
  });
});

describe.sequential("sendScheduledIngestRetriesExhaustedEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queues an email with retry counts and last error", async () => {
    const payload = createPayloadMock();
    const ingest = buildCronIngest({
      name: "Hourly Fetch",
      scheduleType: "frequency",
      frequency: "hourly",
      cronExpression: null,
    });

    await sendScheduledIngestRetriesExhaustedEmail(payload as never, owner, ingest, 4, 3, "HTTP 500 from upstream");

    expect(payload.jobs.queue).toHaveBeenCalledTimes(1);
    const job = payload.jobs.queue.mock.calls[0]?.[0] as {
      task: string;
      input: { to: string; subject: string; html: string; context: string };
      meta: { context: string };
    };

    expect(job.task).toBe("send-email");
    expect(job.input.context).toBe(EMAIL_CONTEXTS.SCHEDULED_INGEST_RETRIES_EXHAUSTED);
    expect(job.meta.context).toBe(EMAIL_CONTEXTS.SCHEDULED_INGEST_RETRIES_EXHAUSTED);
    expect(job.input.to).toBe(TEST_EMAILS.user);
    expect(job.input.subject).toContain("Hourly Fetch");
    expect(job.input.subject.toLowerCase()).toContain("too many failures");
    expect(job.input.html).toContain("HTTP 500 from upstream");
    expect(job.input.html).toContain("frequency");
    expect(job.input.html).toContain("hourly");
    expect(job.input.html).toContain("4");
    expect(job.input.html).toContain("3");
    expect(job.input.html).toContain("https://app.example.com/admin/collections/scheduled-ingests/42");
  });
});
