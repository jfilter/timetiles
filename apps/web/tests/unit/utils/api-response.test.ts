/**
 * Unit tests for API response utilities.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it, vi } from "vitest";

import {
  apiError,
  badRequest,
  createErrorHandler,
  forbidden,
  internalError,
  methodNotAllowed,
  notFound,
  unauthorized,
} from "@/lib/utils/api-response";

describe("api-response", () => {
  describe("apiError", () => {
    it("should create error response with message and status", async () => {
      const res = apiError("Something went wrong", 500);
      const body = await res.json();
      expect(res.status).toBe(500);
      expect(body.error).toBe("Something went wrong");
    });

    it("should include code and details when provided", async () => {
      const res = apiError("Bad input", 400, "INVALID", { field: "name" });
      const body = await res.json();
      expect(body.code).toBe("INVALID");
      expect(body.details).toEqual({ field: "name" });
    });
  });

  describe("convenience helpers", () => {
    it("should create 400 response", () => {
      const res = badRequest("Invalid");
      expect(res.status).toBe(400);
    });

    it("should create 401 response", () => {
      const res = unauthorized();
      expect(res.status).toBe(401);
    });

    it("should create 403 response", () => {
      const res = forbidden();
      expect(res.status).toBe(403);
    });

    it("should create 404 response", () => {
      const res = notFound();
      expect(res.status).toBe(404);
    });

    it("should create 405 response", () => {
      const res = methodNotAllowed("Only GET allowed");
      expect(res.status).toBe(405);
    });

    it("should create 500 response", () => {
      const res = internalError();
      expect(res.status).toBe(500);
    });
  });

  describe("createErrorHandler", () => {
    it("should log error and return 500 response", async () => {
      const mockLogger = { error: vi.fn() };
      const handler = createErrorHandler("fetching events", mockLogger);
      const error = new Error("DB connection failed");

      const res = handler(error);
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.error).toBe("Failed to events");
      expect(body.details).toBe("DB connection failed");
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
