/**
 * TypeScript declarations for `next/root-params`.
 *
 * `next typegen` treats app/(payload)/layout.tsx as the "/" layout and so finds no root
 * params; the compiler resolves `[locale]` per root layout and does export `locale()`.
 * @module
 */
declare module "next/root-params" {
  export function locale(): Promise<string | undefined>;
}
