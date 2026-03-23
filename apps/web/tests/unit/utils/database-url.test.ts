/**
 * Tests for database URL utilities
 *
 * @module
 * @category Tests
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetEnv } from "@/lib/config/env";

import {
  constructDatabaseUrl,
  deriveDatabaseUrl,
  getDatabaseInfo,
  getDatabaseUrl,
  getTestDatabaseUrl,
  isTestDatabase,
  parseDatabaseUrl,
} from "../../../lib/database/url";
import { TEST_CREDENTIALS } from "../../constants/test-credentials";

// Construct reusable test database URLs from centralized credentials
const TEST_DB_USER = TEST_CREDENTIALS.basic.alternateUsername;
const TEST_DB_PASS = TEST_CREDENTIALS.basic.alternatePassword;
const TEST_DB_URL = `postgresql://${TEST_DB_USER}:${TEST_DB_PASS}@localhost:5432/mydb`;
const TEST_DB_URL_NO_PORT = `postgresql://${TEST_DB_USER}:${TEST_DB_PASS}@localhost/mydb`;

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
      const url = TEST_DB_URL;
      const parsed = parseDatabaseUrl(url);

      expect(parsed).toEqual({
        username: TEST_DB_USER,
        password: TEST_DB_PASS,
        host: "localhost",
        port: "5432",
        database: "mydb",
        fullUrl: url,
      });
    });

    it("should use default port when not specified", () => {
      const url = TEST_DB_URL_NO_PORT;
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
        username: TEST_DB_USER,
        password: TEST_DB_PASS,
        host: "localhost",
        port: "5432",
        database: "mydb",
      });

      expect(url).toBe(TEST_DB_URL);
    });
  });

  describe("deriveDatabaseUrl", () => {
    it("should create test database URL with worker ID", () => {
      const baseUrl = TEST_DB_URL;
      const testUrl = deriveDatabaseUrl(baseUrl, { workerId: "1" });

      expect(testUrl).toBe(`postgresql://${TEST_DB_USER}:${TEST_DB_PASS}@localhost:5432/mydb_test_1`);
    });

    it("should create test database URL without worker ID", () => {
      const baseUrl = TEST_DB_URL;
      const testUrl = deriveDatabaseUrl(baseUrl, {});

      expect(testUrl).toBe(`postgresql://${TEST_DB_USER}:${TEST_DB_PASS}@localhost:5432/mydb_test`);
    });

    it("should clean existing _test suffix to avoid duplication", () => {
      const baseUrl = `postgresql://${TEST_DB_USER}:${TEST_DB_PASS}@localhost:5432/mydb_test`;
      const testUrl = deriveDatabaseUrl(baseUrl, { workerId: "1" });

      expect(testUrl).toBe(`postgresql://${TEST_DB_USER}:${TEST_DB_PASS}@localhost:5432/mydb_test_1`);
    });

    it("should handle existing _test_1 suffix", () => {
      const baseUrl = `postgresql://${TEST_DB_USER}:${TEST_DB_PASS}@localhost:5432/mydb_test_1`;
      const testUrl = deriveDatabaseUrl(baseUrl, { workerId: "2" });

      expect(testUrl).toBe(`postgresql://${TEST_DB_USER}:${TEST_DB_PASS}@localhost:5432/mydb_test_2`);
    });
  });

  describe("getDatabaseUrl", () => {
    it("should return DATABASE_URL when set", () => {
      process.env.DATABASE_URL = TEST_DB_URL;
      resetEnv();

      const url = getDatabaseUrl();
      expect(url).toBe(TEST_DB_URL);
    });

    it("should throw when required and not set", () => {
      delete process.env.DATABASE_URL;
      resetEnv();

      expect(() => getDatabaseUrl(true)).toThrow("DATABASE_URL environment variable is required");
    });

    it("should return falsy when not required and not set", () => {
      delete process.env.DATABASE_URL;
      resetEnv();

      const url = getDatabaseUrl(false);
      expect(url).toBeFalsy();
    });
  });

  describe("getTestDatabaseUrl", () => {
    it("should return test database URL for current worker", () => {
      process.env.DATABASE_URL = TEST_DB_URL;
      process.env.VITEST_WORKER_ID = "2";
      resetEnv();

      const url = getTestDatabaseUrl();
      expect(url).toBe(`postgresql://${TEST_DB_USER}:${TEST_DB_PASS}@localhost:5432/mydb_test_2`);
    });

    it("should work without worker ID", () => {
      process.env.DATABASE_URL = TEST_DB_URL;
      delete process.env.VITEST_WORKER_ID;
      resetEnv();

      const url = getTestDatabaseUrl();
      expect(url).toBe(`postgresql://${TEST_DB_USER}:${TEST_DB_PASS}@localhost:5432/mydb_test`);
    });
  });

  describe("isTestDatabase", () => {
    it("should identify test databases", () => {
      expect(isTestDatabase(`postgresql://${TEST_DB_USER}:${TEST_DB_PASS}@localhost:5432/mydb_test`)).toBe(true);
      expect(isTestDatabase(`postgresql://${TEST_DB_USER}:${TEST_DB_PASS}@localhost:5432/mydb_test_1`)).toBe(true);
      // Note: We only check for _test suffix, not test_ prefix
    });

    it("should identify non-test databases", () => {
      expect(isTestDatabase(TEST_DB_URL)).toBe(false);
      expect(isTestDatabase(`postgresql://${TEST_DB_USER}:${TEST_DB_PASS}@localhost:5432/production`)).toBe(false);
      expect(isTestDatabase(`postgresql://${TEST_DB_USER}:${TEST_DB_PASS}@localhost:5432/test_mydb`)).toBe(false);
    });
  });

  describe("getDatabaseInfo", () => {
    it("should return safe database info without password", () => {
      const url = `postgresql://${TEST_DB_USER}:${TEST_DB_PASS}@localhost:5432/mydb`;
      const info = getDatabaseInfo(url);

      expect(info).toEqual({ username: TEST_DB_USER, host: "localhost", port: "5432", database: "mydb" });

      expect(info).not.toHaveProperty("password");
      expect(info).not.toHaveProperty("fullUrl");
    });
  });
});
