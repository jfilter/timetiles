/**
 * Canonical E2E runtime detection.
 *
 * `next build` inlines dot-notation `process.env.X` at build time and
 * `next start` forces `NODE_ENV=production`, so no `NODE_ENV` comparison
 * reliably identifies the E2E server at runtime. Bracket-notation access
 * avoids the inline and reads `E2E_MODE` from the running process env
 * (set by `tests/e2e/global-setup.ts`). Mirrors the pattern at
 * `lib/security/url-validation.ts:80`.
 *
 * @module
 * @category Utils
 */

export const isE2E = (): boolean => process.env["E2E_MODE"] === "true";
