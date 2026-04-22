/**
 * Integration tests for queued transactional email delivery.
 *
 * @module
 * @category Integration Tests
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { EMAIL_CONTEXTS, queueEmail } from "@/lib/email/send";
import { EMAIL_RETRY_DELAY_MS } from "@/lib/jobs/handlers/send-email-job";
import { createIntegrationTestEnvironment } from "@/tests/setup/integration/environment";

describe.sequential("Send Email Job", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: any;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await testEnv.seedManager.truncate(["payload-jobs"]);
  });

  it("queues an app-managed email with readable job metadata and sends it when jobs run", async () => {
    const sendEmailSpy = vi.spyOn(payload, "sendEmail").mockResolvedValue(undefined);

    await queueEmail(
      payload,
      { to: "queued@example.com", subject: "Queued", html: "<p>Queued</p>" },
      EMAIL_CONTEXTS.ACCOUNT_EXISTS
    );

    const pendingJobs = await payload.find({
      collection: "payload-jobs",
      where: { taskSlug: { equals: "send-email" }, completedAt: { exists: false } },
      overrideAccess: true,
    });

    expect(pendingJobs.docs).toHaveLength(1);
    expect(pendingJobs.docs[0].meta).toEqual({
      channel: "email",
      context: EMAIL_CONTEXTS.ACCOUNT_EXISTS,
      maskedTo: "qu***@ex***.com",
    });

    await payload.jobs.run({ allQueues: true, limit: 10 });

    expect(sendEmailSpy).toHaveBeenCalledTimes(1);

    const remainingPendingJobs = await payload.find({
      collection: "payload-jobs",
      where: { taskSlug: { equals: "send-email" }, completedAt: { exists: false } },
      overrideAccess: true,
    });

    expect(remainingPendingJobs.docs).toHaveLength(0);
  });

  it("retries transient send failures and eventually succeeds", async () => {
    const sendEmailSpy = vi
      .spyOn(payload, "sendEmail")
      .mockRejectedValueOnce(Object.assign(new Error("Temporary SMTP failure"), { responseCode: 421 }))
      .mockResolvedValueOnce(undefined);

    await queueEmail(
      payload,
      { to: "retry@example.com", subject: "Retry", html: "<p>Retry</p>" },
      EMAIL_CONTEXTS.EXPORT_READY
    );

    const queuedJobs = await payload.find({
      collection: "payload-jobs",
      where: { taskSlug: { equals: "send-email" }, completedAt: { exists: false } },
      overrideAccess: true,
    });

    expect(queuedJobs.docs).toHaveLength(1);
    const queuedJobId = queuedJobs.docs[0].id;

    await payload.jobs.run({ allQueues: true, limit: 10 });

    const retryingJob = await payload.findByID({ collection: "payload-jobs", id: queuedJobId, overrideAccess: true });

    expect(retryingJob.totalTried).toBe(1);
    expect(retryingJob.hasError).toBe(false);
    expect(retryingJob.waitUntil).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, EMAIL_RETRY_DELAY_MS + 20));
    await payload.jobs.run({ allQueues: true, limit: 10 });

    expect(sendEmailSpy).toHaveBeenCalledTimes(2);

    const remainingPendingJobs = await payload.find({
      collection: "payload-jobs",
      where: { taskSlug: { equals: "send-email" }, completedAt: { exists: false } },
      overrideAccess: true,
    });

    expect(remainingPendingJobs.docs).toHaveLength(0);
  });

  it("marks terminal send failures as cancelled without retrying again", async () => {
    const sendEmailSpy = vi
      .spyOn(payload, "sendEmail")
      .mockRejectedValueOnce(Object.assign(new Error("Mailbox unavailable"), { responseCode: 550 }));

    await queueEmail(
      payload,
      { to: "terminal@example.com", subject: "Terminal", html: "<p>Terminal</p>" },
      EMAIL_CONTEXTS.EXPORT_FAILED
    );

    const queuedJobs = await payload.find({
      collection: "payload-jobs",
      where: { taskSlug: { equals: "send-email" }, completedAt: { exists: false } },
      overrideAccess: true,
    });

    expect(queuedJobs.docs).toHaveLength(1);
    const queuedJobId = queuedJobs.docs[0].id;

    await payload.jobs.run({ allQueues: true, limit: 10 });

    const failedJob = await payload.findByID({ collection: "payload-jobs", id: queuedJobId, overrideAccess: true });

    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    expect(failedJob.hasError).toBe(true);
    expect(failedJob.error).toMatchObject({ cancelled: true, message: "Mailbox unavailable" });
    expect(failedJob.waitUntil).toBeNull();
  });

  it("cancels malformed input (missing context) on first attempt and does not retry", async () => {
    // Regression: send-email-job.ts:79 throws JobCancelledError when input
    // is missing any required field. We assume Payload will halt retries
    // on JobCancelledError; this test pins that contract — otherwise a
    // permanently malformed payload would burn all 3 retry attempts.
    const sendEmailSpy = vi.spyOn(payload, "sendEmail");

    // Bypass queueEmail's typed signature: queue the task directly with
    // an input that is missing `context`, which triggers getJobInput's
    // JobCancelledError path before any SMTP call.
    const queued = await payload.jobs.queue({
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- intentional malformed payload for regression test
      task: "send-email",
      input: { to: "malformed@example.com", subject: "Subject", html: "<p>Hello</p>" } as never,
      meta: { channel: "email", context: EMAIL_CONTEXTS.ACCOUNT_EXISTS, maskedTo: "ma***@ex***.com" },
    });

    const queuedJobId = (queued as { id: string | number }).id;

    await payload.jobs.run({ allQueues: true, limit: 10 });

    const failedJob = await payload.findByID({ collection: "payload-jobs", id: queuedJobId, overrideAccess: true });

    // SMTP was never called — validation fails first.
    expect(sendEmailSpy).not.toHaveBeenCalled();

    // Payload honored JobCancelledError: job is marked failed, not queued
    // for retry (no waitUntil set for backoff), and the error is flagged
    // as cancelled rather than a transient failure awaiting retry.
    //
    // Fallback assertion (per task 4 note): we verify the halt contract
    // via hasError/cancelled/waitUntil rather than Payload's internal
    // totalTried counter, which is 0 when the handler cancels without
    // incrementing the attempt budget.
    expect(failedJob.hasError).toBe(true);
    expect(failedJob.waitUntil).toBeNull();
    expect(failedJob.error).toMatchObject({
      cancelled: true,
      message: expect.stringContaining("Email job input must include"),
    });

    // Second explicit run must not pick up the cancelled job again —
    // if Payload were treating it as retryable, the handler would fire
    // a second time and hit getJobInput again.
    await payload.jobs.run({ allQueues: true, limit: 10 });
    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  it("cancels unclassifiable SMTP errors via the default-terminal branch without retrying", async () => {
    // Regression: the classifier in send-email-job.ts defaults to
    // "terminal" for errors lacking a recognized responseCode or transport
    // code. The assumption is that an unclassifiable error is almost
    // always a programming bug (e.g. template rendering) rather than a
    // transient network blip, so we cancel instead of burning retries.
    // This test verifies Payload respects the JobCancelledError in that
    // default path too.
    const unknownError = new Error("Unexpected template rendering failure");
    // No `code`, no `responseCode` — classifier falls through to
    // "terminal" by default.
    const sendEmailSpy = vi.spyOn(payload, "sendEmail").mockRejectedValueOnce(unknownError);

    await queueEmail(
      payload,
      { to: "unclassified@example.com", subject: "Unclassified", html: "<p>Hi</p>" },
      EMAIL_CONTEXTS.EXPORT_READY
    );

    const queuedJobs = await payload.find({
      collection: "payload-jobs",
      where: { taskSlug: { equals: "send-email" }, completedAt: { exists: false } },
      overrideAccess: true,
    });
    expect(queuedJobs.docs).toHaveLength(1);
    const queuedJobId = queuedJobs.docs[0].id;

    await payload.jobs.run({ allQueues: true, limit: 10 });

    const failedJob = await payload.findByID({ collection: "payload-jobs", id: queuedJobId, overrideAccess: true });

    // One SMTP attempt, then JobCancelledError halts further retries.
    // We verify halt via hasError/cancelled/waitUntil rather than
    // Payload's internal totalTried counter.
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    expect(failedJob.hasError).toBe(true);
    expect(failedJob.waitUntil).toBeNull();
    expect(failedJob.error).toMatchObject({ cancelled: true, message: "Unexpected template rendering failure" });

    // Second run cycle does NOT fire the handler again — Payload
    // treated JobCancelledError as a halt, not a retryable failure.
    await payload.jobs.run({ allQueues: true, limit: 10 });
    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
  });
});
