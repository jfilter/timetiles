# Changelog

All notable changes to the TimeTiles Cartographic Design System will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- CHANGELOG.md to track design system changes ✨
- CONTENT_VOICE.md - Writing style, tone, microcopy patterns ✨
- PATTERNS.md - UI patterns (forms, errors, loading, empty states) ✨
- ICONS.md - Icon system documentation (Lucide React) ✨

## [1.1.0] - 2026-01-28

### Added
- Quick Decision Guide section at top of DESIGN_SYSTEM.md
- Decision flowcharts for color tokens, component placement, and font selection
- Common mistakes reference table

### Changed
- Reorganized documentation into `docs/` folder structure
- Extracted theming documentation to THEMING.md (229 lines)
- Extracted component status to COMPONENT_STATUS.md (93 lines)
- Extracted Header component details to components/HEADER.md (220 lines)
- Reduced main DESIGN_SYSTEM.md from 1,184 to 763 lines (-35%)

### Improved
- Design system is now decision-focused with supporting docs
- Quick reference links throughout documentation
- Cleaner separation between guidance and reference material

## [1.0.0] - 2025-11-23

### Added
- Initial Cartographic Design System
- OKLCH color space for perceptual uniformity
- Typography system (Playfair Display, DM Sans, Space Mono)
- Semantic design tokens for theming
- Component patterns following shadcn/ui conventions
- Intentionally cartographic Header components
- Multi-theme support architecture
- Dark mode support
- Accessibility guidelines (WCAG AA)

### Components
- Form components: Button, Input, Textarea, Label, Select
- Layout components: Card, Hero, Features, Stats, CallToAction, Footer
- Header components: Header, HeaderBrand, HeaderNav, HeaderActions, HeaderDecorative
- Data visualization: BaseChart, BarChart, TimeHistogram

## Version Guidelines

### Major (x.0.0)
Breaking changes that require code updates:
- Removed components or props
- Renamed design tokens
- Changed component APIs
- Incompatible structural changes

### Minor (0.x.0)
Backwards-compatible additions:
- New components
- New variants or props
- New design tokens
- New documentation sections

### Patch (0.0.x)
Backwards-compatible fixes:
- Bug fixes
- Documentation updates
- Style refinements
- Accessibility improvements

## Migration Guides

### Migrating to 1.1.0

**File paths changed:**
- `packages/ui/DESIGN_SYSTEM.md` → `packages/ui/docs/DESIGN_SYSTEM.md`
- See `packages/ui/docs/THEMING.md` for theming details
- See `packages/ui/docs/COMPONENT_STATUS.md` for component list

**No breaking changes** - All components remain backwards compatible.

---

For questions or feedback, open an issue in the TimeTiles repository.
