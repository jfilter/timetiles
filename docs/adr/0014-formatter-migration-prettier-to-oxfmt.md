# ADR 0014: Formatter Migration from Prettier to oxfmt

## Status

Accepted

## Context

The codebase used Prettier 3.8.1 as its code formatter, deeply integrated into ESLint via `eslint-plugin-prettier` (reporting formatting violations as lint errors) and `eslint-config-prettier` (disabling conflicting ESLint rules). This coupling meant formatting ran through ESLint's pipeline — slower and more complex than necessary.

Oxfmt (the oxc formatter) reached beta in February 2026 with 100% Prettier JavaScript/TypeScript conformance, ~30x faster execution, and built-in Tailwind CSS class sorting — eliminating the need for `prettier-plugin-tailwindcss`.

Goals:

- Decouple formatting from linting (separation of concerns)
- Reduce dependency count (4 packages removed)
- Improve formatting speed (~30x)
- Simplify the toolchain (no plugin system needed)

## Decision

### Replace Prettier with oxfmt

**Configuration**: `.oxfmtrc.json` at the repository root, auto-generated via `oxfmt --migrate prettier` and manually adjusted. All Prettier options map 1:1 to oxfmt equivalents.

**Key settings**:

- `printWidth: 120`, `tabWidth: 2`, `trailingComma: "es5"` (matching previous Prettier config)
- `sortTailwindcss: {}` — built-in, replaces `prettier-plugin-tailwindcss`
- `sortPackageJson: true` — sorts `package.json` fields
- `ignorePatterns` — consolidated from root `.prettierignore` and `apps/web/.prettierignore`

### Decouple formatting from ESLint

Removed from `packages/eslint-config/base.js`:

- `eslint-config-prettier` — no longer needed since ESLint no longer enforces formatting
- `eslint-plugin-prettier` — formatting is now a standalone step via `oxfmt`
- `"prettier/prettier": "error"` rule

CI enforcement moved from ESLint's `prettier/prettier` rule to a dedicated `oxfmt --check .` step in `.github/workflows/build.yml`, running before linting.

### Keep `eslint-plugin-simple-import-sort` for import sorting

Oxfmt has a built-in `sortImports` option, but it cannot be used in this codebase due to two blockers:

1. **File-level JSDoc comments**: Every file has a `@module` JSDoc block before imports (enforced by `jsdoc/require-file-overview`). Oxfmt's `sortImports` merges import groups across the JSDoc block, hoisting imports above it — breaking the `@module` convention and failing lint.

2. **`customGroups` immaturity**: Separating `@/` aliased imports from other internal imports requires `customGroups`, which is [still being developed](https://github.com/oxc-project/oxc/issues/17076).

Import sorting remains in `eslint-plugin-simple-import-sort`, which runs during the `eslint --fix` step in every package's `format` script. This can be revisited when oxfmt's `sortImports` handles leading file comments correctly.

## Packages Removed

| Package                       | Role                                               |
| ----------------------------- | -------------------------------------------------- |
| `prettier`                    | Formatter                                          |
| `prettier-plugin-tailwindcss` | Tailwind class sorting plugin                      |
| `eslint-config-prettier`      | Disabled ESLint rules conflicting with Prettier    |
| `eslint-plugin-prettier`      | Ran Prettier as an ESLint rule                     |
| `@timetiles/prettier-config`  | Shared Prettier config workspace package (deleted) |

## Files Changed

| Area                                      | Changes                                                            |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `.oxfmtrc.json`                           | New config file (migrated from `.prettierrc.js`)                   |
| `packages/eslint-config/base.js`          | Removed Prettier imports, plugin, config, and rule                 |
| `apps/web/eslint.config.js`               | Removed `"prettier/prettier": "off"` migration override            |
| 7 `package.json` files                    | `prettier --write` replaced with `oxfmt --write` in format scripts |
| `apps/web/scripts/generate-payload.ts`    | `prettier` invocation replaced with `oxfmt`                        |
| `.claude/hooks/format-on-save.sh`         | `npx prettier` replaced with `npx oxfmt`                           |
| `.github/workflows/build.yml`             | Added `oxfmt --check .` CI step                                    |
| `package.json` (root)                     | Swapped `prettier` + plugin for `oxfmt`                            |
| `pnpm-workspace.yaml`                     | Removed `prettier` from catalog                                    |
| `.npmrc`                                  | Removed `*prettier*` hoist pattern                                 |
| `packages/prettier-config/`               | Deleted entirely                                                   |
| `.prettierrc.js`, `.prettierignore` files | Deleted                                                            |

## Consequences

### Positive

- **~30x faster formatting** (1.6s vs Prettier on 850 files)
- **4 fewer dependencies** and one fewer workspace package
- **Cleaner separation**: formatting (`oxfmt`) and linting (`ESLint/oxlint`) are independent concerns
- **Built-in Tailwind sorting** without a plugin
- **CI catches formatting issues earlier** via dedicated `oxfmt --check` step

### Negative

- **Formatting diff on adoption**: ~70 files reformatted (mostly markdown tables, YAML whitespace, and previously-unformatted scripts using single quotes)
- **Beta software**: oxfmt is beta (Feb 2026), though already used by Vue, Turborepo, Sentry, and others
- **Import sorting not unified**: two tools handle formatting concerns (`oxfmt` for code formatting, `eslint-plugin-simple-import-sort` for import ordering)

### Neutral

- `oxfmt --check` in CI replaces `prettier/prettier` ESLint rule — same enforcement, different mechanism
- Developers use `make format` as before — the underlying tool changed transparently
