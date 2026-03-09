/**
 * Unit tests for Payload config factory test email behavior.
 *
 * @module
 * @category Tests
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { buildConfigMock, createTestAccountMock, createTransportMock, nodemailerAdapterMock, postgresAdapterMock } =
  vi.hoisted(() => ({
    buildConfigMock: vi.fn((config) => config),
    createTestAccountMock: vi.fn().mockResolvedValue({
      user: "ethereal-user",
      pass: "ethereal-pass",
      web: "https://ethereal.example",
    }),
    createTransportMock: vi.fn((options) => ({ transportOptions: options })),
    nodemailerAdapterMock: vi.fn((options) => options),
    postgresAdapterMock: vi.fn(() => ({ name: "mock-db-adapter" })),
  }));

vi.mock("payload", () => ({
  buildConfig: buildConfigMock,
}));

vi.mock("nodemailer", () => ({
  default: {
    createTestAccount: createTestAccountMock,
    createTransport: createTransportMock,
  },
}));

vi.mock("@payloadcms/db-postgres", () => ({
  postgresAdapter: postgresAdapterMock,
}));

vi.mock("@payloadcms/email-nodemailer", () => ({
  nodemailerAdapter: nodemailerAdapterMock,
}));

vi.mock("@payloadcms/richtext-lexical", () => ({
  lexicalEditor: vi.fn(() => ({ name: "mock-editor" })),
}));

vi.mock("@timetiles/payload-schema-detection", () => ({
  schemaDetectionPlugin: vi.fn(() => ({ name: "mock-schema-plugin" })),
}));

vi.mock("sharp", () => ({
  default: {},
}));

vi.mock("@/lib/collections/users", () => ({
  default: { slug: "users" },
}));

import { createTestConfig } from "@/lib/config/payload-config-factory";

describe("createTestConfig", () => {
  beforeEach(() => {
    buildConfigMock.mockClear();
    createTestAccountMock.mockClear();
    createTransportMock.mockClear();
    nodemailerAdapterMock.mockClear();
    postgresAdapterMock.mockClear();
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
        transport: expect.objectContaining({
          transportOptions: { jsonTransport: true },
        }),
      })
    );
  });
});
