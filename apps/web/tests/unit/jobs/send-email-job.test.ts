/**
 * Unit tests for the send-email job handler.
 *
 * @module
 * @category Unit Tests
 */

vi.mock("@/lib/logger", () => ({ createLogger: vi.fn(() => ({ info: vi.fn() })), logError: vi.fn() }));

import { JobCancelledError } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMAIL_CONTEXTS } from "@/lib/email/send";
import { EMAIL_RETRY_DELAY_MS, sendEmailJob } from "@/lib/jobs/handlers/send-email-job";
import { logError } from "@/lib/logger";

const createPayloadMock = () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) });

const createContext = (payload: ReturnType<typeof createPayloadMock>) =>
  ({
    input: { to: "user@example.com", subject: "Subject", html: "<p>Hello</p>", context: EMAIL_CONTEXTS.ACCOUNT_EXISTS },
    job: { id: "job-1" },
    req: { payload },
  }) as never;

describe.sequential("sendEmailJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports the expected retry policy and concurrency key", () => {
    expect(sendEmailJob.slug).toBe("send-email");
    expect(sendEmailJob.concurrency()).toBe("email-send");
    expect(sendEmailJob.retries).toEqual({
      attempts: 3,
      backoff: { delay: EMAIL_RETRY_DELAY_MS, type: "exponential" },
    });
  });

  it("sends the email exactly once and returns success output", async () => {
    const payload = createPayloadMock();

    const result = await sendEmailJob.handler(createContext(payload));

    expect(payload.sendEmail).toHaveBeenCalledTimes(1);
    expect(payload.sendEmail).toHaveBeenCalledWith({
      to: "user@example.com",
      subject: "Subject",
      html: "<p>Hello</p>",
    });
    expect(result).toEqual({ output: { success: true, context: EMAIL_CONTEXTS.ACCOUNT_EXISTS } });
  });

  it("re-throws transient errors so Payload can retry", async () => {
    const payload = createPayloadMock();
    const error = Object.assign(new Error("socket hang up"), { code: "ESOCKET" });
    payload.sendEmail.mockRejectedValueOnce(error);

    const thrown = await sendEmailJob.handler(createContext(payload)).catch((err: unknown) => err);

    expect(thrown).toBe(error);
    expect(thrown).not.toBeInstanceOf(JobCancelledError);
    expect(logError).toHaveBeenCalledWith(error, EMAIL_CONTEXTS.ACCOUNT_EXISTS, {
      classification: "retriable",
      jobId: "job-1",
      maskedTo: "us***@ex***.com",
    });
  });

  it("converts terminal SMTP failures into JobCancelledError", async () => {
    const payload = createPayloadMock();
    const error = Object.assign(new Error("Mailbox unavailable"), { responseCode: 550 });
    payload.sendEmail.mockRejectedValueOnce(error);

    const thrown = await sendEmailJob.handler(createContext(payload)).catch((err: unknown) => err);

    expect(thrown).toBeInstanceOf(JobCancelledError);
    expect((thrown as Error).message).toBe("Mailbox unavailable");
    expect(logError).toHaveBeenCalledWith(error, EMAIL_CONTEXTS.ACCOUNT_EXISTS, {
      classification: "terminal",
      jobId: "job-1",
      maskedTo: "us***@ex***.com",
    });
  });

  it("rejects invalid job input before attempting delivery", async () => {
    const payload = createPayloadMock();
    const badContext = {
      input: { to: "user@example.com", subject: "Subject", html: "<p>Hello</p>" },
      job: { id: "job-1" },
      req: { payload },
    } as never;

    await expect(sendEmailJob.handler(badContext)).rejects.toThrow(
      "Email job input must include to, subject, html, and context"
    );

    expect(payload.sendEmail).not.toHaveBeenCalled();
  });
});
