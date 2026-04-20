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
});
