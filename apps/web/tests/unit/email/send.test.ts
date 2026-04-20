/**
 * Unit tests for queued email helper behavior.
 *
 * @module
 * @category Unit Tests
 */

const mocks = vi.hoisted(() => {
  const emailLogger = { info: vi.fn() };

  return { createLogger: vi.fn(() => emailLogger), emailLogger, logError: vi.fn() };
});

vi.mock("@/lib/logger", () => ({ createLogger: mocks.createLogger, logError: mocks.logError }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import { maskEmail } from "@/lib/security/masking";

const createPayloadMock = () => ({ jobs: { queue: vi.fn().mockResolvedValue({ id: "email-job-1" }) } });

describe.sequential("safeSendEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.createLogger.mockReturnValue(mocks.emailLogger);
  });

  it("queues the email with job metadata and logs success", async () => {
    const payload = createPayloadMock();
    const { EMAIL_CONTEXTS, EMAIL_JOB_QUEUE, EMAIL_TASK_SLUG, safeSendEmail } = await import("@/lib/email/send");

    await safeSendEmail(
      payload as never,
      { to: "user@example.com", subject: "Welcome", html: "<p>Hello</p>" },
      EMAIL_CONTEXTS.ACCOUNT_EXISTS
    );

    expect(payload.jobs.queue).toHaveBeenCalledWith({
      task: EMAIL_TASK_SLUG,
      queue: EMAIL_JOB_QUEUE,
      input: {
        to: "user@example.com",
        subject: "Welcome",
        html: "<p>Hello</p>",
        context: EMAIL_CONTEXTS.ACCOUNT_EXISTS,
      },
      meta: { channel: "email", context: EMAIL_CONTEXTS.ACCOUNT_EXISTS, maskedTo: maskEmail("user@example.com") },
    });
    expect(mocks.emailLogger.info).toHaveBeenCalledWith(
      {
        channel: "email",
        context: EMAIL_CONTEXTS.ACCOUNT_EXISTS,
        maskedTo: maskEmail("user@example.com"),
        jobId: "email-job-1",
      },
      "Email queued"
    );
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("logs and swallows queue failures", async () => {
    const payload = createPayloadMock();
    const error = new Error("queue unavailable");
    payload.jobs.queue.mockRejectedValueOnce(error);
    const { EMAIL_CONTEXTS, safeSendEmail } = await import("@/lib/email/send");

    await safeSendEmail(
      payload as never,
      { to: "user@example.com", subject: "Welcome", html: "<p>Hello</p>" },
      EMAIL_CONTEXTS.ACCOUNT_EXISTS
    );

    expect(mocks.logError).toHaveBeenCalledWith(error, EMAIL_CONTEXTS.ACCOUNT_EXISTS, {
      channel: "email",
      context: EMAIL_CONTEXTS.ACCOUNT_EXISTS,
      maskedTo: maskEmail("user@example.com"),
    });
  });
});
