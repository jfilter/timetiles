/**
 * Payload field visibility uses the authenticated user, not document data.
 * @module
 * @category Tests
 */
import type { Condition } from "payload";
import { describe, expect, it } from "vitest";

import { editorOrAdminCondition } from "@/lib/collections/shared-fields";

describe("editorOrAdminCondition", () => {
  const condition: Condition = editorOrAdminCondition;

  it.each([
    ["admin", true],
    ["editor", true],
    ["user", false],
  ] as const)("uses the authenticated %s role", (role, expected) => {
    expect(
      condition(
        {},
        {},
        { user: { role } as Parameters<Condition>[2]["user"], operation: "update", blockData: {}, path: [] }
      )
    ).toBe(expected);
  });

  it("does not treat a request-shaped document as an authenticated administrator", () => {
    expect(
      condition({ req: { user: { role: "admin" } } }, {}, { user: null, operation: "update", blockData: {}, path: [] })
    ).toBe(false);
  });
});
