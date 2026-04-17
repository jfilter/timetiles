# ADR 0038: Site Custom CSS Sanitization

## Status

Proposed

## Context

The `sites` collection exposes `customCode.customCSS` as an admin-only escape hatch for site-specific styling. The current sanitizer is regex-based and single-pass:

- it strips a short list of known-dangerous substrings
- it does not parse CSS structure
- it can be bypassed by syntactic variations the regexes do not understand

At the same time, raw custom CSS still solves real product needs that the structured site-branding fields do not fully cover yet. Site admins use it to refine layouts, block styling, and other presentation details without shipping code.

We need to decide whether to:

1. remove raw custom CSS entirely
2. keep it and harden the sanitizer properly
3. keep the current regex sanitizer and accept the risk

## Decision

TimeTiles will **keep the custom CSS feature**, but move it to an **AST-based PostCSS sanitizer with a strict allowlist model**.

The existing structured branding system remains the preferred path. Custom CSS stays as an advanced admin-only escape hatch, not as the primary theming mechanism.

### Sanitization model

Custom CSS should be parsed with PostCSS using a safe parser. Sanitization must operate on parsed nodes rather than string replacement.

Allowed constructs:

- standard style rules
- declarations
- comments
- `@media`
- `@supports`

Blocked constructs:

- `@import`
- `@font-face`
- `@namespace`
- `@charset`
- browser-specific binding features
- any function or declaration that loads external resources
- any construct that reads DOM attributes into generated content

### Declaration policy

Sanitization should use a curated allowlist for declaration/property families that support presentation and layout within the site shell, including:

- color and typography
- spacing and sizing
- borders, shadows, and opacity
- flex/grid layout
- transforms, transitions, and animation timing
- CSS custom properties

The sanitizer should reject or drop declarations that enable exfiltration, global overlay abuse, or cross-scope escape, including:

- resource-loading functions such as `url()`
- DOM-reading generated content such as `attr()`
- legacy scriptable properties such as `behavior` / `-moz-binding`
- full-viewport overlay primitives that are outside the approved property set

### Scope model

All custom CSS should remain site-scoped before render. The sanitizer must run on the scoped CSS that will actually be emitted, not on a looser intermediate string.

### Admin UX

Unsafe CSS should fail with structured validation feedback during save. Silent string replacement is not enough; admins need to know which rule was rejected and why.

### Compatibility stance

Existing saved CSS may contain rules that are no longer allowed. The migration strategy should preserve stored content until the next edit, but any new save must pass the AST sanitizer.

## Consequences

### Positive

- The sanitizer understands real CSS structure instead of guessing with regex
- Admins keep an escape hatch for site-level styling
- Unsafe rules can be rejected with actionable validation messages
- The design-token and branding-field system remains the default path rather than being undermined by arbitrary CSS

### Negative

- Sanitization logic becomes more complex than the current regex helper
- Some existing admin-authored CSS may stop validating once edited
- The allowlist will need maintenance as supported styling patterns evolve

### Neutral

- Custom CSS remains admin-only
- Custom HTML sanitization remains a separate concern and should not be coupled to the CSS parser

## Alternatives Considered

### Remove raw custom CSS entirely

Rejected for now. The structured branding system is not yet expressive enough to replace every real-world site customization need.

### Keep the regex sanitizer

Rejected. The review item exists because regex stripping is too easy to bypass and too opaque to reason about safely.

### Parse CSS but keep a denylist-only policy

Rejected. The review specifically called for an allowlist approach, and a denylist alone would still leave too much ambiguous surface area.

## Related

- ADR 0017: Multi-Tenancy Sites
- ADR 0035: UI Customization System
