/**
 * Type-level guard for `root-params.d.ts`.
 *
 * next ships a body-less `declare module "next/root-params"` that types the module as `any`;
 * if it ever shadows our declaration, these assertions stop compiling.
 *
 * @module
 * @category Unit Tests
 */
import type { locale } from "next/root-params";
import { describe, expectTypeOf, it } from "vitest";

describe("next/root-params types", () => {
  it("types locale() as the optional [locale] root param", () => {
    expectTypeOf<Awaited<ReturnType<typeof locale>>>().toEqualTypeOf<string | undefined>();
  });
});
