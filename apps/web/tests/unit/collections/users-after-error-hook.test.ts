/**
 * Unit tests for the Users afterError hook.
 *
 * `/api/auth/login` is a hardened wrapper, but Payload's own `/api/users/login` stays
 * registered and is served by the catch-all at `app/(payload)/api/[...slug]`. There,
 * `LockedAuth`'s "This user is locked due to having too many failed login attempts" went
 * back verbatim — and only a REGISTERED address can ever accumulate failed attempts, so six
 * requests proved whether an account exists. This hook collapses every auth rejection on
 * that path to the same 401 body.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { AuthenticationError, LockedAuth } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auditMocks = vi.hoisted(() => ({ auditLog: vi.fn() }));

vi.mock("@/lib/services/audit-log-service", () => ({
  AUDIT_ACTIONS: { LOGIN_FAILED: "login-failed" },
  auditLog: auditMocks.auditLog,
  auditFieldChanges: vi.fn(),
}));

import { usersAfterErrorHook } from "@/lib/collections/users/hooks";

const hook = usersAfterErrorHook[0]!;

/** Minimal REST-context args: `result` is the formatted body Payload would have returned. */
const restArgs = (error: Error, email = "victim@example.test") =>
  ({
    error,
    result: { errors: [{ message: error.message }] },
    req: { payload: {}, data: { email }, headers: new Headers(), t: undefined },
    context: {},
    collection: undefined,
  }) as unknown as Parameters<typeof hook>[0];

// Sequential: the repo runs tests concurrently by default (vitest.config.ts
// `sequence.concurrent: true`), and these assertions share one module-level audit mock.
describe.sequential("usersAfterErrorHook", () => {
  beforeEach(() => {
    // Explicit: the shared vi.hoisted mock is module-level, so relying on a global
    // clear leaks call history between tests here.
    auditMocks.auditLog.mockClear();
  });

  it("replaces a lockout message with the generic authentication error", async () => {
    const locked = new LockedAuth();
    expect(locked.message).toMatch(/locked/i);

    const result = await hook(restArgs(locked));

    expect(result).toBeDefined();
    expect(result?.status).toBe(401);
    // The whole point: the response must not reveal that this address is a real account.
    expect(JSON.stringify(result?.response)).not.toMatch(/locked/i);
    expect(result?.response?.errors).toEqual([{ message: new AuthenticationError().message }]);
  });

  it("returns the same body for an unknown address as for a locked one", async () => {
    const unknownAddress = await hook(restArgs(new AuthenticationError()));
    const lockedAccount = await hook(restArgs(new LockedAuth()));

    expect(unknownAddress?.response).toEqual(lockedAccount?.response);
    expect(unknownAddress?.status).toBe(lockedAccount?.status);
  });

  it("audits a lockout as a failed login, not just a wrong password", async () => {
    await hook(restArgs(new LockedAuth()));

    expect(auditMocks.auditLog).toHaveBeenCalledOnce();
    const [, entry] = auditMocks.auditLog.mock.calls[0]!;
    expect(entry).toMatchObject({ action: "login-failed", userId: 0, userEmail: "victim@example.test" });
  });

  it("ignores errors that are not authentication rejections", async () => {
    const result = await hook(restArgs(new Error("database exploded")));

    expect(result).toBeUndefined();
    expect(auditMocks.auditLog).not.toHaveBeenCalled();
  });

  it("does not rewrite when there is no REST result (GraphQL context)", async () => {
    const args = restArgs(new LockedAuth());
    delete (args as { result?: unknown }).result;

    const result = await hook(args);

    // Still audited, but nothing to override.
    expect(result).toBeUndefined();
    expect(auditMocks.auditLog).toHaveBeenCalledOnce();
  });
});
