/**
 * Error types for TimeScrape runner.
 *
 * @module
 * @category Lib
 */

export class RunnerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = "RunnerError";
  }
}

export class TimeoutError extends RunnerError {
  constructor(timeoutSecs: number) {
    super(`Scraper exceeded timeout of ${timeoutSecs}s`, "TIMEOUT", 408);
    this.name = "TimeoutError";
  }
}

export class OutputValidationError extends RunnerError {
  constructor(message: string) {
    super(message, "INVALID_OUTPUT", 422);
    this.name = "OutputValidationError";
  }
}

export class AuthError extends RunnerError {
  constructor() {
    super("Invalid or missing API key", "UNAUTHORIZED", 401);
    this.name = "AuthError";
  }
}

export class ConcurrencyError extends RunnerError {
  constructor(maxConcurrent: number) {
    super(`Max concurrent runs (${maxConcurrent}) reached`, "CONCURRENCY_LIMIT", 429);
    this.name = "ConcurrencyError";
  }
}
