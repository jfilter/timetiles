/**
 * Unit tests for Users collection lifecycle hooks.
 *
 * Covers verification-token TTL stamping (Payload generates the token AFTER
 * collection beforeChange hooks on create, so the expiry must be stamped
 * unconditionally there) and login enforcement of `isActive`.
 *
 * @module
 * @category Tests
 */
import type { FieldAccess } from "payload";
import { describe, expect, it } from "vitest";

import Users from "@/lib/collections/users";
import { usersBeforeChangeHook, usersBeforeLoginHook } from "@/lib/collections/users/hooks";

const securityHook = usersBeforeChangeHook[1]!;
const beforeLogin = usersBeforeLoginHook[0]!;

const localReq = { payloadAPI: "local", user: null } as never;

describe("usersBeforeChangeHook: verification token expiry", () => {
  it("stamps _verificationTokenExpiresAt on create even though the token is not in data", async () => {
    // Payload assigns `_verificationToken` after beforeChange hooks run, so the
    // hook never sees it on create — without the unconditional stamp every
    // self-registered user's verification link is rejected as expired.
    const data: Record<string, unknown> = { email: "new@example.com" };

    await securityHook({ data, operation: "create", req: localReq, originalDoc: undefined } as never);

    expect(typeof data._verificationTokenExpiresAt).toBe("string");
    expect(new Date(data._verificationTokenExpiresAt as string).getTime()).toBeGreaterThan(Date.now());
  });

  it("stamps the expiry on update when a flow rotates the token (change-email)", async () => {
    const data: Record<string, unknown> = { _verificationToken: "a".repeat(40) };

    await securityHook({ data, operation: "update", req: localReq, originalDoc: { id: 1 } } as never);

    expect(typeof data._verificationTokenExpiresAt).toBe("string");
  });

  it("does not stamp the expiry on unrelated updates", async () => {
    const data: Record<string, unknown> = { firstName: "Ada" };

    await securityHook({ data, operation: "update", req: localReq, originalDoc: { id: 1 } } as never);

    expect(data._verificationTokenExpiresAt).toBeUndefined();
  });
});

describe("usersBeforeLoginHook: isActive enforcement", () => {
  it("rejects logins for deactivated accounts", () => {
    expect(() => beforeLogin({ user: { id: 1, isActive: false } } as never)).toThrow(
      "This account has been deactivated."
    );
  });

  it("allows logins for active accounts (including legacy null isActive)", () => {
    expect(beforeLogin({ user: { id: 1, isActive: true } } as never)).toEqual({ id: 1, isActive: true });
    expect(beforeLogin({ user: { id: 2, isActive: null } } as never)).toEqual({ id: 2, isActive: null });
  });
});

describe("isActive field access", () => {
  const isActiveField = Users.fields.find((f) => "name" in f && f.name === "isActive");
  const updateAccess = (isActiveField && "access" in isActiveField ? isActiveField.access?.update : undefined) as
    | FieldAccess
    | undefined;

  it("only admins may update isActive", () => {
    expect(updateAccess).toBeDefined();
    expect(updateAccess!({ req: { user: { role: "admin" } } } as never)).toBe(true);
    expect(updateAccess!({ req: { user: { role: "user" } } } as never)).toBe(false);
  });
});
