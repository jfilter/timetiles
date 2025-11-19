/**
 * Tests for database URL utilities
 *
 * @module
 * @category Tests
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  constructDatabaseUrl,
  deriveTestDatabaseUrl,
  getDatabaseInfo,
  getDatabaseUrl,
  getTestDatabaseUrl,
  isTestDatabase,
  parseDatabaseUrl,
} from "../../../lib/database/url";

describe("Database URL Utilities", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("parseDatabaseUrl", () => {
    it("should parse a standard PostgreSQL URL", () => {
      const url = "postgresql://user:pass@localhost:5432/mydb";
      const parsed = parseDatabaseUrl(url);

      expect(parsed).toEqual({
        username: "user",
        password: "pass",
        host: "localhost",
        port: "5432",
        database: "mydb",
        fullUrl: url,
      });
    });

    it("should use default port when not specified", () => {
      const url = "postgresql://user:pass@localhost/mydb";
      const parsed = parseDatabaseUrl(url);

      expect(parsed.port).toBe("5432");
    });

    it("should handle special characters in password", () => {
      const url = "postgresql://user:p%40ss%21@localhost:5432/mydb";
      const parsed = parseDatabaseUrl(url);

      expect(parsed.password).toBe("p%40ss%21");
    });
  });

  describe("constructDatabaseUrl", () => {
    it("should construct a valid PostgreSQL URL", () => {
      const url = constructDatabaseUrl({
        username: "user",
        password: "pass",
        host: "localhost",
        port: "5432",
        database: "mydb",
      });

      expect(url).toBe("postgresql://user:pass@localhost:5432/mydb");
    });
  });

  describe("deriveTestDatabaseUrl", () => {
    it("should add _test suffix when not present", () => {
      const baseUrl = "postgresql://user:pass@localhost:5432/mydb";
      const testUrl = deriveTestDatabaseUrl(baseUrl);

      expect(testUrl).toBe("postgresql://user:pass@localhost:5432/mydb_test");
    });

    it("should not duplicate _test suffix", () => {
      const baseUrl = "postgresql://user:pass@localhost:5432/mydb_test";
      const testUrl = deriveTestDatabaseUrl(baseUrl);

      expect(testUrl).toBe("postgresql://user:pass@localhost:5432/mydb_test");
    });

    it("should add worker ID when provided", () => {
      const baseUrl = "postgresql://user:pass@localhost:5432/mydb";
      const testUrl = deriveTestDatabaseUrl(baseUrl, "3");

      expect(testUrl).toBe("postgresql://user:pass@localhost:5432/mydb_test_3");
    });

    it("should handle existing _test with worker ID", () => {
      const baseUrl = "postgresql://user:pass@localhost:5432/mydb_test";
      const testUrl = deriveTestDatabaseUrl(baseUrl, "2");

      expect(testUrl).toBe("postgresql://user:pass@localhost:5432/mydb_test_2");
    });
  });

  describe("getDatabaseUrl", () => {
    it("should return DATABASE_URL when set", () => {
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/mydb";

      const url = getDatabaseUrl();
      expect(url).toBe("postgresql://user:pass@localhost:5432/mydb");
    });

    it("should throw when required and not set", () => {
      delete process.env.DATABASE_URL;

      expect(() => getDatabaseUrl(true)).toThrow("DATABASE_URL environment variable is required");
    });

    it("should return undefined when not required and not set", () => {
      delete process.env.DATABASE_URL;

      const url = getDatabaseUrl(false);
      expect(url).toBeUndefined();
    });
  });

  describe("getTestDatabaseUrl", () => {
    it("should return test database URL for current worker", () => {
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/mydb";
      process.env.VITEST_WORKER_ID = "2";

      const url = getTestDatabaseUrl();
      expect(url).toBe("postgresql://user:pass@localhost:5432/mydb_test_2");
    });

    it("should work without worker ID", () => {
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/mydb";
      delete process.env.VITEST_WORKER_ID;

      const url = getTestDatabaseUrl();
      expect(url).toBe("postgresql://user:pass@localhost:5432/mydb_test");
    });
  });

  describe("isTestDatabase", () => {
    it("should identify test databases", () => {
      expect(isTestDatabase("postgresql://user:pass@localhost:5432/mydb_test")).toBe(true);
      expect(isTestDatabase("postgresql://user:pass@localhost:5432/mydb_test_1")).toBe(true);
      // Note: We only check for _test suffix, not test_ prefix
    });

    it("should identify non-test databases", () => {
      expect(isTestDatabase("postgresql://user:pass@localhost:5432/mydb")).toBe(false);
      expect(isTestDatabase("postgresql://user:pass@localhost:5432/production")).toBe(false);
      expect(isTestDatabase("postgresql://user:pass@localhost:5432/test_mydb")).toBe(false);
    });
  });

  describe("getDatabaseInfo", () => {
    it("should return safe database info without password", () => {
      const url = "postgresql://user:secret@localhost:5432/mydb";
      const info = getDatabaseInfo(url);

      expect(info).toEqual({
        username: "user",
        host: "localhost",
        port: "5432",
        database: "mydb",
      });

      expect(info).not.toHaveProperty("password");
      expect(info).not.toHaveProperty("fullUrl");
    });
  });
});
