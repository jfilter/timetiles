# ADR 0035: UI Customization System

## Status

Accepted

## Context

TimeTiles is a multi-tenant platform where each site deployment may need distinct visual branding, layout, and content structure. The existing customization surface is limited: sites have 3 color overrides (primary, secondary, background), a raw `headerHtml` textarea, and a fixed page builder with 11 hardcoded block types. Content editors cannot control per-block spacing or visibility, there is no reusable theme system, and developers cannot add new block types without modifying core code.

This ADR documents a comprehensive UI customization system spanning six complementary strategies, ordered from low-code CMS-driven approaches to developer-extensible platforms.

## Decision

### Strategy 1: Expanded CMS Theme Tokens

Expand the 3-color site branding to the full semantic token palette (~15 tokens) editable from the Payload dashboard. Add font pairing selection, border radius presets, and spacing density controls.

**Implementation:**

- Extend `Sites.branding.colors` group with all semantic tokens: `foreground`, `card`, `cardForeground`, `popover`, `popoverForeground`, `primaryForeground`, `secondary`, `secondaryForeground`, `muted`, `mutedForeground`, `accent`, `accentForeground`, `destructive`, `border`, `ring`
- Add `Sites.branding.typography` group with `fontPairing` select (editorial, modern, monospace)
- Add `Sites.branding.style` group with `borderRadius` (sharp, rounded, pill) and `density` (compact, default, comfortable)
- Expand `SiteBranding` component to inject all resolved tokens as CSS custom properties
- All existing components already use semantic tokens (`bg-background`, `text-foreground`), so they automatically respect overrides

Source: `lib/collections/sites/index.ts`, `components/site-branding.tsx`, `lib/context/site-context.tsx`

### Strategy 2: Block-Level Style Controls

Add per-block styling controls to every page builder block: spacing (top/bottom padding), background color, max-width, anchor IDs, device visibility, and section separators.

**Implementation:**

- Create shared `blockStyleFields` included in every block definition via spread
- Add `BlockStyle` interface to `lib/types/cms-blocks.ts`
- Wrap each block's output in `block-renderer.tsx` with a `<section>` applying resolved styles
- Fields are collapsible in the admin UI to avoid overwhelming content editors

Source: `lib/collections/pages.ts`, `components/block-renderer.tsx`, `lib/types/cms-blocks.ts`

### Strategy 3: Theme Presets Collection

Create a `themes` collection storing named, reusable, versionable theme configurations assignable to sites via a relationship field.

**Implementation:**

- New `Themes` collection with complete color palette (light + dark mode), typography, and style fields
- `theme` relationship field on the `Sites` collection
- `SiteBranding` reads from the related theme, with inline site colors as overrides
- Payload's built-in versioning provides free theme rollback

Source: `lib/collections/themes.ts`, `lib/collections/sites/index.ts`, `lib/config/payload-shared-config.ts`

### Strategy 4: Custom CSS/Code Injection

Provide safe, scoped custom CSS and HTML injection via the CMS. Replaces the raw `headerHtml` field with a structured `customCode` group.

**Implementation:**

- Replace `headerHtml` with `customCode` group: `headHtml`, `customCSS`, `bodyStartHtml`, `bodyEndHtml`
- Inject `customCSS` as a `<style>` tag scoped under `[data-site]` in the frontend layout
- CSS sanitizer strips dangerous patterns: `@import`, `url()`, `javascript:`, `expression()`, `position: fixed`
- Each rendered block gets `data-block-type` and `data-block-id` attributes for CSS targeting

Source: `lib/collections/sites/index.ts`, `lib/utils/css-sanitizer.ts`, `app/[locale]/(frontend)/layout.tsx`

### Strategy 5: Extensible Block Registry

Plugin system allowing developers to register new block types without modifying core code. Each plugin bundles Payload field definitions and React renderers.

**Implementation:**

- `BlockPlugin` interface with `slug`, `labels`, `fields`, `render` function
- Block registry at `lib/blocks/registry.ts` with `registerBlock()` / `getRegisteredBlocks()`
- Existing 11 blocks refactored from monolithic `pages.ts` into individual files under `lib/blocks/`
- `pages.ts` consumes `getRegisteredBlocks()` for its blocks array
- `block-renderer.tsx` builds renderer map dynamically from registry

Source: `lib/blocks/registry.ts`, `lib/blocks/*.ts`, `lib/collections/pages.ts`, `components/block-renderer.tsx`

### Strategy 6: Layout Templates

CMS-managed layout templates controlling header style, footer variant, content width, and page structure, assignable per site or per page.

**Implementation:**

- New `LayoutTemplates` collection with `headerVariant`, `footerVariant`, `contentMaxWidth`, `stickyHeader` fields
- `defaultLayout` relationship on Sites, `layoutOverride` on Pages
- `LayoutShell` component in the frontend layout resolves the active template and renders the appropriate header/footer/content structure
- Template inheritance: page override > site default > platform default

Source: `lib/collections/layout-templates.ts`, `components/layout/layout-shell.tsx`, `app/[locale]/(frontend)/layout.tsx`

## Consequences

### Positive

- **Progressive complexity**: Admins start with simple color overrides (Strategy 1), advance to theme presets (Strategy 3), and use CSS injection (Strategy 4) as an escape hatch
- **Content editor empowerment**: Block-level style controls (Strategy 2) give editors meaningful visual control without code
- **Developer extensibility**: Block registry (Strategy 5) enables new block types without forking core code
- **Multi-tenant flexibility**: Each site can have distinct visual identity through themes, layouts, and custom CSS
- **Backward compatible**: All strategies are additive; existing sites and pages work unchanged with sensible defaults

### Negative

- **Schema complexity**: Three new collections (Themes, LayoutTemplates, and block registry metadata) increase the data model surface area
- **Migration required**: Adding fields to Sites and Pages collections requires database migration
- **CSS injection risk**: Custom CSS can break layouts or create accessibility issues; sanitizer mitigates but cannot eliminate this risk
- **Type safety tradeoff**: Block registry makes the `Block` union type dynamic rather than statically known at compile time

### Neutral

- Font pairing presets are limited to pre-configured options because Next.js font loading happens at build/layout level; fully dynamic font loading would require a different approach
- Layout templates control structure (header/footer/width) but not arbitrary slot-based content distribution, keeping complexity manageable
