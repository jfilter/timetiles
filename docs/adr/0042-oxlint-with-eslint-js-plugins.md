# ADR 0042: Oxlint as the Only Linter, with ESLint Plugins as JS Plugins

## Status

Accepted (2026-11-06) — configured in the root `.oxlintrc.json`, with local wrappers in `scripts/oxlint/`.

## Context

The repository linted with ESLint through a shared `packages/eslint-config` workspace package and one `eslint.config.js` per package, while oxlint already handled the rules it ports natively. Two linters meant two configurations, two runs in every check, and rules that drifted between them.

Oxlint can load ESLint plugins as JS plugins. That covers most plugins this codebase depends on that have no native oxlint port, so ESLint is no longer needed to run them.

The ESLint setup also had a gap: the root run never resolved `@/` path aliases, so the `boundaries` layer rules were only enforced for relative imports.

## Decision

Oxlint is the only linter. Every package lints with the root `.oxlintrc.json`.

- **Native rules** come from oxlint's built-in plugins (TypeScript, import, unicorn, JSDoc, promise, Vitest, jsx-a11y).
- **ESLint plugins without a native port** (SonarJS, security, regexp, JSDoc extras, `simple-import-sort`, `@eslint-react`, `eslint-plugin-react`, Next.js, TanStack Query, `boundaries`, and others) run as oxlint JS plugins.
- **Local wrappers** in `scripts/oxlint/` supply what plain JSON cannot: `boundaries.mjs` passes an absolute repo root and the package tsconfigs to the resolver, so `@/` imports are checked; `core.mjs` runs the ESLint core rules oxlint lacks (`no-restricted-syntax`, `require-atomic-updates`).
- **Interface naming** (PascalCase, no `I` prefix) is a local rule, because typescript-eslint's `naming-convention` needs type information.
- **Dropped rules**: type-aware SonarJS rules (SonarCloud still reports them), i18next, MDX linting, typed TanStack and `@eslint-react` rules, and SonarJS test rules that fail under the JS plugin runtime.

`packages/eslint-config`, every `eslint.config.*` file and the `lint:eslint` script are removed. A unit test of the oxlint configuration replaces the root ESLint test.

## Consequences

- One linter configuration and one lint run. A forced `pnpm lint` across the workspace took 34 seconds when this was adopted.
- Layer boundaries are enforced for aliased imports as well as relative ones.
- Suppressions use `oxlint-disable-next-line <plugin>/<rule>`.
- Rules that need type information or an MDX parser are not checked locally. SonarCloud covers part of the type-aware set; MDX content relies on the docs build and the link checker.
- JS plugins depend on oxlint's plugin runtime staying compatible with the ESLint plugin APIs they use; a plugin that breaks there has to be dropped or wrapped locally.
