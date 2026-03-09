/**
 * Unit tests for customQuotas field-level access control.
 *
 * @module
 * @category Tests
 */
import type { FieldAccess } from "payload";
import { describe, expect, it } from "vitest";

import Users from "@/lib/collections/users";

// Extract the customQuotas field from the Users collection
const customQuotasField = Users.fields.find((f) => "name" in f && f.name === "customQuotas");
const access = customQuotasField && "access" in customQuotasField ? customQuotasField.access : undefined;

describe("customQuotas field access", () => {
  describe("read", () => {
    const readAccess = access?.read as FieldAccess;

    it("should allow admin users to read", () => {
      const result = readAccess({ req: { user: { role: "admin" } } } as any);
      expect(result).toBe(true);
    });

    it("should deny non-admin users from reading", () => {
      const result = readAccess({ req: { user: { role: "user" } } } as any);
      expect(result).toBe(false);
    });

    it("should deny when no user is present", () => {
      const result = readAccess({ req: { user: null } } as any);
      expect(result).toBe(false);
    });
  });

  describe("update", () => {
    const updateAccess = access?.update as FieldAccess;

    it("should allow admin users to update", () => {
      const result = updateAccess({ req: { user: { role: "admin" } } } as any);
      expect(result).toBe(true);
    });

    it("should deny non-admin users from updating", () => {
      const result = updateAccess({ req: { user: { role: "user" } } } as any);
      expect(result).toBe(false);
    });
  });
});
