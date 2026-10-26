/**
 * Unit tests for Payload config factory email and job execution behavior.
 *
 * @module
 * @category Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  buildConfigMock,
  createTestAccountMock,
  createTransportMock,
  files,
  nodemailerAdapterMock,
  postgresAdapterMock,
  verifyMock,
} = vi.hoisted(() => {
  const verifyMock = vi.fn().mockResolvedValue(true);
  return {
    buildConfigMock: vi.fn((config) => config),
    createTestAccountMock: vi
      .fn()
      .mockResolvedValue({ user: "ethereal-user", pass: "ethereal-pass", web: "https://ethereal.example" }),
    createTransportMock: vi.fn((options) => ({ transportOptions: options, verify: verifyMock })),
    files: new Map<string, string>(),
    nodemailerAdapterMock: vi.fn((options) => options),
    postgresAdapterMock: vi.fn(() => ({ name: "mock-db-adapter" })),
    verifyMock,
  };
});

vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  existsSync: (path: string) => files.has(path),
  readFileSync: (path: string) => files.get(path),
  writeFileSync: (path: string, data: string) => files.set(path, data),
}));

vi.mock("payload", () => ({ buildConfig: buildConfigMock }));

vi.mock("nodemailer", () => ({
  default: { createTestAccount: createTestAccountMock, createTransport: createTransportMock },
}));

vi.mock("@payloadcms/db-postgres", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  postgresAdapter: postgresAdapterMock,
}));

vi.mock("@payloadcms/email-nodemailer", () => ({ nodemailerAdapter: nodemailerAdapterMock }));

vi.mock("@payloadcms/richtext-lexical", () => ({ lexicalEditor: vi.fn(() => ({ name: "mock-editor" })) }));

vi.mock("@/lib/services/schema-detection", () => ({
  schemaDetectionPlugin: vi.fn(() => ({ name: "mock-schema-plugin" })),
}));

vi.mock("sharp", () => ({ default: {} }));

vi.mock("@/lib/collections/users", () => ({ default: { slug: "users" } }));

import { resetEnv } from "@/lib/config/env";
import { TEST_CREDENTIALS } from "@/tests/constants/test-credentials";
import { createTestConfig } from "@/tests/setup/test-config";

describe("createTestConfig", () => {
  beforeEach(() => {
    buildConfigMock.mockClear();
    createTestAccountMock.mockClear();
    createTransportMock.mockClear();
    nodemailerAdapterMock.mockClear();
    postgresAdapterMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnv();
  });

  it("should configure a local json email transport in test mode", async () => {
    await createTestConfig({
      databaseUrl: "postgres://user:pass@localhost:5432/timetiles_test",
      secret: "test-secret",
      serverURL: "https://localhost:3000",
    });

    expect(createTestAccountMock).not.toHaveBeenCalled();
    expect(createTransportMock).toHaveBeenCalledWith({ jsonTransport: true });
    expect(nodemailerAdapterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        skipVerify: true,
        transport: expect.objectContaining({ transportOptions: { jsonTransport: true } }),
      })
    );
  });

  it("should build an authenticated SMTP transport when a host is configured", async () => {
    vi.stubEnv("EMAIL_SMTP_HOST", "smtp.internal.example");
    vi.stubEnv("EMAIL_SMTP_PORT", "465");
    vi.stubEnv("EMAIL_SMTP_USER", TEST_CREDENTIALS.basic.username);
    vi.stubEnv("EMAIL_SMTP_PASS", TEST_CREDENTIALS.basic.password);
    vi.stubEnv("EMAIL_SMTP_TLS_SERVERNAME", "mail.example.org");
    resetEnv();

    await createTestConfig({ environment: "development" });

    const smtpOptions = {
      host: "smtp.internal.example",
      port: 465,
      auth: { user: TEST_CREDENTIALS.basic.username, pass: TEST_CREDENTIALS.basic.password },
      tls: { servername: "mail.example.org" },
    };
    expect(createTestAccountMock).not.toHaveBeenCalled();
    expect(createTransportMock).toHaveBeenCalledWith(smtpOptions);
    expect(nodemailerAdapterMock).toHaveBeenCalledWith(
      expect.objectContaining({ transport: expect.objectContaining({ transportOptions: smtpOptions }) })
    );
  });

  it("uses native job scheduling for every development queue", async () => {
    const config = await createTestConfig({ environment: "development" });

    expect(config.jobs?.autoRun).toEqual([
      { cron: "*/10 * * * * *", queue: "ingest", limit: 10 },
      { cron: "* * * * *", queue: "default", limit: 10 },
      { cron: "* * * * *", queue: "maintenance", limit: 10 },
    ]);
  });

  it.each(["test", "production"] as const)("does not start in-process workers in %s", async (environment) => {
    const config = await createTestConfig({ environment });

    expect(config.jobs?.autoRun).toBeUndefined();
  });

  it("does not register queue delays as unsupported task timeouts", async () => {
    const config = await createTestConfig();

    expect(config.jobs?.tasks?.length).toBeGreaterThan(0);
    for (const task of config.jobs?.tasks ?? []) {
      expect(task).not.toHaveProperty("waitUntil");
    }
  });
});

describe("ethereal fallback in development", () => {
  const cacheFile = `${process.cwd()}/.ethereal-credentials.json`;
  const cached = { user: "cached-user", pass: "cached-pass" };

  const loadDevConfig = async () => {
    vi.resetModules();
    const { createTestConfig: freshCreateTestConfig } = await import("@/tests/setup/test-config");
    return freshCreateTestConfig({ environment: "development" });
  };

  const expectTransportUser = (user: string) =>
    expect(nodemailerAdapterMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        transport: expect.objectContaining({
          transportOptions: expect.objectContaining({ auth: expect.objectContaining({ user }) }),
        }),
      })
    );

  beforeEach(() => {
    files.clear();
    files.set(cacheFile, JSON.stringify(cached));
    createTestAccountMock.mockClear();
    nodemailerAdapterMock.mockClear();
    verifyMock.mockReset().mockResolvedValue(true);
  });

  it("reuses cached credentials the server accepts", async () => {
    await loadDevConfig();

    expect(createTestAccountMock).not.toHaveBeenCalled();
    expectTransportUser("cached-user");
  });

  it("replaces cached credentials the server rejects", async () => {
    verifyMock.mockRejectedValueOnce(Object.assign(new Error("Invalid login: 535"), { code: "EAUTH" }));

    await loadDevConfig();

    expect(createTestAccountMock).toHaveBeenCalledOnce();
    expectTransportUser("ethereal-user");
    expect(JSON.parse(files.get(cacheFile) ?? "{}")).toEqual({ user: "ethereal-user", pass: "ethereal-pass" });
  });

  it("keeps cached credentials when the server is unreachable", async () => {
    verifyMock.mockRejectedValueOnce(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNECTION" }));

    await loadDevConfig();

    expect(createTestAccountMock).not.toHaveBeenCalled();
    expectTransportUser("cached-user");
  });

  it("retries account creation after a failed attempt", async () => {
    files.clear();
    createTestAccountMock.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND api.nodemailer.com"));
    vi.resetModules();
    const { createTestConfig: freshCreateTestConfig } = await import("@/tests/setup/test-config");

    await expect(freshCreateTestConfig({ environment: "development" })).rejects.toThrow("ENOTFOUND");
    await freshCreateTestConfig({ environment: "development" });

    expect(createTestAccountMock).toHaveBeenCalledTimes(2);
    expectTransportUser("ethereal-user");
  });
});
