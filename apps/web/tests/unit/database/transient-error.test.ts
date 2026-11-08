/**
 * @module
 */
import { describe, expect, it } from "vitest";

import { isTransientDatabaseError } from "@/lib/database/transient-error";

const withCode = (code: string, message = "db error") => Object.assign(new Error(message), { code });

describe("isTransientDatabaseError", () => {
  it.each([
    ["serialization failure", withCode("40001")],
    ["deadlock", withCode("40P01")],
    ["statement timeout", withCode("57014")],
    ["admin shutdown", withCode("57P01")],
    ["connection exception class", withCode("08006")],
    ["too many connections", withCode("53300")],
    ["socket reset", withCode("ECONNRESET")],
    ["pg connection loss without a code", new Error("Connection terminated unexpectedly")],
    ["pool connect timeout", new Error("timeout exceeded when trying to connect")],
    ["wrapped in a cause", Object.assign(new Error("Failed query"), { cause: withCode("40001") })],
  ])("treats %s as transient", (_label, error) => {
    expect(isTransientDatabaseError(error)).toBe(true);
  });

  it.each([
    ["unique violation", withCode("23505")],
    ["invalid text representation", withCode("22P02")],
    ["not-null violation", withCode("23502")],
    ["plain error", new Error("Invalid source identifier")],
    ["file not found", withCode("ENOENT")],
    ["non-error value", "connection lost"],
    ["null", null],
  ])("treats %s as permanent", (_label, error) => {
    expect(isTransientDatabaseError(error)).toBe(false);
  });
});
