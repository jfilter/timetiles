/**
 * Unit tests for email helpers.
 *
 * Covers branding lookup, translation/context wiring, shared layout rendering,
 * template output, and safe email sending behavior.
 *
 * @module
 * @category Unit Tests
 */
const mocks = vi.hoisted(() => {
  const emailLogger = { info: vi.fn() };

  return {
    createLogger: vi.fn(() => emailLogger),
    emailLogger,
    getEnv: vi.fn(() => ({ NEXT_PUBLIC_PAYLOAD_URL: "https://app.example.com" })),
    logError: vi.fn(),
  };
});

vi.mock("@/lib/config/env", () => ({ getEnv: mocks.getEnv }));

vi.mock("@/lib/logger", () => ({ createLogger: mocks.createLogger, logError: mocks.logError }));

import { beforeEach, describe, expect, it, vi } from "vitest";

interface MockPayload {
  findGlobal: ReturnType<typeof vi.fn>;
  jobs: { queue: ReturnType<typeof vi.fn> };
}

const createPayloadMock = (): MockPayload => ({
  findGlobal: vi.fn().mockResolvedValue({ siteName: "Atlas", logoLight: { url: "/media/logo.png" } }),
  jobs: { queue: vi.fn().mockResolvedValue({ id: "email-job-1" }) },
});

describe.sequential("email helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.createLogger.mockReturnValue(mocks.emailLogger);
    mocks.getEnv.mockReturnValue({ NEXT_PUBLIC_PAYLOAD_URL: "https://app.example.com" });
  });

  describe("queueEmail", () => {
    it("sends the email and logs success", async () => {
      const payload = createPayloadMock();
      const { EMAIL_CONTEXTS, queueEmail } = await import("@/lib/email/send");

      await queueEmail(
        payload as never,
        { to: "user@example.com", subject: "Welcome", html: "<p>Hello</p>" },
        EMAIL_CONTEXTS.ACCOUNT_EXISTS
      );

      expect(payload.jobs.queue).toHaveBeenCalledWith(
        expect.objectContaining({
          task: "send-email",
          queue: "default",
          input: expect.objectContaining({
            to: "user@example.com",
            subject: "Welcome",
            html: "<p>Hello</p>",
            context: EMAIL_CONTEXTS.ACCOUNT_EXISTS,
          }),
        })
      );
      expect(mocks.createLogger).toHaveBeenCalledWith("email");
      expect(mocks.emailLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ context: EMAIL_CONTEXTS.ACCOUNT_EXISTS, jobId: "email-job-1" }),
        "Email queued"
      );
      expect(mocks.logError).not.toHaveBeenCalled();
    });

    it("logs and swallows send failures", async () => {
      const payload = createPayloadMock();
      const error = new Error("smtp offline");
      payload.jobs.queue.mockRejectedValueOnce(error);
      const { EMAIL_CONTEXTS, queueEmail } = await import("@/lib/email/send");

      await queueEmail(
        payload as never,
        { to: "user@example.com", subject: "Welcome", html: "<p>Hello</p>" },
        EMAIL_CONTEXTS.ACCOUNT_EXISTS
      );

      expect(mocks.logError).toHaveBeenCalledWith(
        error,
        EMAIL_CONTEXTS.ACCOUNT_EXISTS,
        expect.objectContaining({ context: EMAIL_CONTEXTS.ACCOUNT_EXISTS })
      );
    });
  });

  describe("branding and context", () => {
    it("builds absolute logo URLs and caches repeated branding lookups", async () => {
      const payload = createPayloadMock();
      const { getEmailBranding } = await import("@/lib/email/branding");

      const first = await getEmailBranding(payload as never);
      const second = await getEmailBranding(payload as never);

      expect(first).toEqual({ siteName: "Atlas", logoUrl: "https://app.example.com/media/logo.png" });
      expect(second).toEqual(first);
      expect(payload.findGlobal).toHaveBeenCalledTimes(1);
    });

    it("falls back to TimeTiles when branding is incomplete", async () => {
      const payload = createPayloadMock();
      payload.findGlobal.mockResolvedValueOnce({ siteName: null, logoLight: null });
      const { getEmailBranding } = await import("@/lib/email/branding");

      const branding = await getEmailBranding(payload as never);

      expect(branding).toEqual({ siteName: "TimeTiles", logoUrl: null });
    });

    it("combines branding with locale-aware translations", async () => {
      const payload = createPayloadMock();
      const { getEmailContext } = await import("@/lib/email/context");

      const context = await getEmailContext(payload as never, "de");

      expect(context.branding.siteName).toBe("Atlas");
      expect(context.t("greeting", { name: "Max" })).toContain("Max");
      expect(context.t("footer")).toContain("Atlas");
      expect(context.t("footer")).toContain("automatische Nachricht");
    });
  });

  describe("layout and templates", () => {
    it("renders shared layout helpers with translated content", async () => {
      const { getEmailTranslations } = await import("@/lib/email/i18n");
      const { callout, emailButton, emailLayout, greeting } = await import("@/lib/email/layout");
      const t = getEmailTranslations("en", { siteName: "Atlas" });

      const html = emailLayout(
        `${greeting(t, "Ada")}${emailButton("https://app.example.com/action", "Confirm")}${callout("<p>Heads up</p>", "amber")}`,
        t,
        "https://app.example.com/logo.png"
      );

      expect(html).toContain("Hello Ada,");
      expect(html).toContain('href="https://app.example.com/action"');
      expect(html).toContain("background-color: #fef3c7");
      expect(html).toContain("This is an automated message from Atlas");
      expect(html).toContain('src="https://app.example.com/logo.png"');
    });

    it("renders verification, notification, and anti-enumeration emails", async () => {
      const { buildAccountExistsEmailHtml, buildOldEmailNotificationHtml, buildVerificationEmailHtml } =
        await import("@/lib/email/templates");
      const branding = { siteName: "Atlas", logoUrl: "https://app.example.com/logo.png" };

      const verificationHtml = buildVerificationEmailHtml(
        "https://app.example.com/verify?token=123",
        "Ada",
        "en",
        branding
      );
      const oldEmailHtml = buildOldEmailNotificationHtml("Ada", "en", branding);
      const accountExistsHtml = buildAccountExistsEmailHtml("https://app.example.com/reset", "de", branding);

      expect(verificationHtml).toContain("Verify your new email address");
      expect(verificationHtml).toContain("https://app.example.com/verify?token=123");
      expect(verificationHtml).toContain("Hello Ada,");
      expect(oldEmailHtml).toContain("Your email address was changed");
      expect(oldEmailHtml).toContain("Hello Ada,");
      expect(accountExistsHtml).toContain("Registrierungsversuch");
      expect(accountExistsHtml).toContain("https://app.example.com/reset");
      expect(accountExistsHtml).toContain("Atlas");
    });
  });
});
