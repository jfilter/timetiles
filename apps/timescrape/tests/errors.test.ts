import { describe, expect, it } from "vitest";

import { AuthError, ConcurrencyError, OutputValidationError, RunnerError, TimeoutError } from "../src/lib/errors.js";

describe("RunnerError", () => {
  it("has correct name, code, statusCode, and message", () => {
    const error = new RunnerError("something broke", "BROKEN", 503);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RunnerError);
    expect(error.name).toBe("RunnerError");
    expect(error.code).toBe("BROKEN");
    expect(error.statusCode).toBe(503);
    expect(error.message).toBe("something broke");
  });

  it("defaults statusCode to 500", () => {
    const error = new RunnerError("internal", "INTERNAL");

    expect(error.statusCode).toBe(500);
  });
});

describe("TimeoutError", () => {
  it("has correct defaults", () => {
    const error = new TimeoutError(60);

    expect(error).toBeInstanceOf(RunnerError);
    expect(error.name).toBe("TimeoutError");
    expect(error.code).toBe("TIMEOUT");
    expect(error.statusCode).toBe(408);
    expect(error.message).toBe("Scraper exceeded timeout of 60s");
  });
});

describe("OutputValidationError", () => {
  it("has correct defaults", () => {
    const error = new OutputValidationError("bad CSV");

    expect(error).toBeInstanceOf(RunnerError);
    expect(error.name).toBe("OutputValidationError");
    expect(error.code).toBe("INVALID_OUTPUT");
    expect(error.statusCode).toBe(422);
    expect(error.message).toBe("bad CSV");
  });
});

describe("AuthError", () => {
  it("has correct defaults", () => {
    const error = new AuthError();

    expect(error).toBeInstanceOf(RunnerError);
    expect(error.name).toBe("AuthError");
    expect(error.code).toBe("UNAUTHORIZED");
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe("Invalid or missing API key");
  });
});

describe("ConcurrencyError", () => {
  it("includes maxConcurrent in message", () => {
    const error = new ConcurrencyError(5);

    expect(error).toBeInstanceOf(RunnerError);
    expect(error.name).toBe("ConcurrencyError");
    expect(error.code).toBe("CONCURRENCY_LIMIT");
    expect(error.statusCode).toBe(429);
    expect(error.message).toBe("Max concurrent runs (5) reached");
  });
});
