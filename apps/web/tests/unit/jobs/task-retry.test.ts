/**
 * Unit tests for taskErrorWillRetry.
 *
 * Mirrors Payload's TaskError shape (dist/queues/errors/index.js): a class
 * named TaskError extending Error with an `args` payload carrying
 * `taskStatus` and `retriesConfig`. Payload decides "final" via
 * `taskStatus.totalTried >= retriesConfig.attempts` in handleTaskError.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { taskErrorWillRetry } from "@/lib/jobs/utils/task-retry";

// Mirrors payload/dist/queues/errors/index.js — the class is not exported
// from the package root, hence the structural detection under test.
class TaskError extends Error {
  args: Record<string, unknown>;
  constructor(args: Record<string, unknown> & { message: string }) {
    super(args.message);
    this.args = args;
  }
}

const makeTaskError = (totalTried: number, attempts: number | { attempts: number }, complete = false): TaskError =>
  new TaskError({ message: "url-fetch failed", taskStatus: { complete, totalTried }, retriesConfig: attempts });

describe("taskErrorWillRetry", () => {
  it("returns true while attempts remain", () => {
    expect(taskErrorWillRetry(makeTaskError(0, { attempts: 3 }))).toBe(true);
    expect(taskErrorWillRetry(makeTaskError(2, { attempts: 3 }))).toBe(true);
  });

  it("returns false on the final attempt", () => {
    expect(taskErrorWillRetry(makeTaskError(3, { attempts: 3 }))).toBe(false);
    expect(taskErrorWillRetry(makeTaskError(4, { attempts: 3 }))).toBe(false);
  });

  it("supports numeric retriesConfig", () => {
    expect(taskErrorWillRetry(makeTaskError(1, 3))).toBe(true);
    expect(taskErrorWillRetry(makeTaskError(3, 3))).toBe(false);
  });

  it("returns false when the task somehow completed", () => {
    expect(taskErrorWillRetry(makeTaskError(0, { attempts: 3 }, true))).toBe(false);
  });

  it("returns false for plain errors and non-errors", () => {
    expect(taskErrorWillRetry(new Error("workflow-level failure"))).toBe(false);
    expect(taskErrorWillRetry("boom")).toBe(false);
    expect(taskErrorWillRetry(undefined)).toBe(false);
  });

  it("returns false for a TaskError with no retries configured", () => {
    const err = new TaskError({ message: "no retries", taskStatus: { complete: false, totalTried: 0 } });
    expect(taskErrorWillRetry(err)).toBe(false);
  });
});
