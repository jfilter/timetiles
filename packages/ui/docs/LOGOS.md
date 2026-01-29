# TimeTiles Logo System

> Complete reference for the TimeTiles logo variations, formats, and usage guidelines.

## Overview

The TimeTiles logo system provides comprehensive variations for all use cases, organized by theme and style. All logos use design system colors exclusively (parchment, navy, charcoal, cream, blue).

## Logo Directory Structure

```
packages/assets/logos/latest/
├── light/                          # Light mode (parchment background)
│   ├── no-grid/                   # Clean logos (no background pattern)
│   │   ├── logo_square.svg        # 667×667px - App icons, favicons
│   │   ├── wordmark_compact.svg   # 667×334px - Social media, compact spaces
│   │   ├── wordmark_horizontal.svg # 1084×334px - Headers, wide layouts
│   │   └── png/                   # PNG exports
│   │       ├── favicon.ico        # Multi-res: 16, 32, 48px
│   │       ├── logo_square_*.png  # 16, 32, 48, 64, 128, 256, 512, 1024, 2000px
│   │       ├── wordmark_compact_*.png
│   │       └── wordmark_horizontal_*.png
│   └── grid/                      # Cartographic grid background variant
│       ├── logo_square.svg
│       ├── wordmark_compact.svg
│       ├── wordmark_horizontal.svg
│       └── png/                   # Same dimensions as no-grid
│
└── dark/                           # Dark mode (navy background)
    ├── no-grid/                   # Clean logos
    │   ├── logo_square.svg
    │   ├── wordmark_compact.svg
    │   ├── wordmark_horizontal.svg
    │   └── png/
    └── grid/                      # Grid variant
        ├── logo_square.svg
        ├── wordmark_compact.svg
        ├── wordmark_horizontal.svg
        └── png/
```

## Logo Variations

**4 Themes × 3 Formats = 12 Base Variations**

| Theme | Background | Tiles | Text | Use Case |
|-------|------------|-------|------|----------|
| **Light Clean** | Parchment (#f8f5f0) | Navy (#4a5d6e) | Charcoal (#404040) | Default light mode |
| **Light Grid** | Parchment + grid | Navy + grid | Charcoal | Decorative light mode |
| **Dark Clean** | Navy (#4a5d6e) | Cream (#e8d5c4) | Parchment (#f8f5f0) | Default dark mode |
| **Dark Grid** | Navy + grid | Cream + grid | Parchment | Decorative dark mode |

## Grid Pattern Details

The grid variations feature a subtle cartographic latitude/longitude grid overlay:

- **Light mode grid**: Navy (#4a5d6e) at 15% opacity
- **Dark mode grid**: Cream (#e8d5c4) at 20% opacity
- **Pattern**: Evenly-spaced vertical and horizontal lines with corner markers
- **Purpose**: Fills empty space, reinforces cartographic aesthetic

## When to Use Each Format

| Format | File | Dimensions | Use Cases |
|--------|------|------------|-----------|
| **Square** | `logo_square.svg` | 667×667px | App icons, favicons, social media profile images, mobile home screen |
| **Compact** | `wordmark_compact.svg` | 667×334px | Twitter/X cards, compact headers, mobile navigation |
| **Horizontal** | `wordmark_horizontal.svg` | 1084×334px | Desktop headers, email signatures, wide banners, hero sections |

## When to Use Grid vs Clean

| Variation | Best For |
|-----------|----------|
| **Clean** | UI components, small sizes (≤128px), busy backgrounds, primary branding |
| **Grid** | Hero sections, large displays (≥512px), plain backgrounds, decorative use |

**Rule of thumb**: Use clean logos for functional UI, grid logos for visual impact.

## Dark Mode Implementation

**Important**: Unlike the general dark mode strategy in the design system, logos use **explicit dark mode variations** rather than CSS inversion. This provides:

1. **Color control**: Exact design system colors (navy background, cream tiles)
2. **Consistency**: Logos look identical across browsers
3. **Accessibility**: Guaranteed contrast ratios

```tsx
// ✅ CORRECT - Use dark mode logo variant
<Image
  src="/logos/light/no-grid/wordmark_horizontal.svg"
  alt="TimeTiles"
  className="dark:hidden"
/>
<Image
  src="/logos/dark/no-grid/wordmark_horizontal.svg"
  alt="TimeTiles"
  className="hidden dark:block"
/>

// ❌ INCORRECT - Don't use CSS inversion for logos
<Image
  src="/logos/light/no-grid/wordmark_horizontal.svg"
  className="dark:invert dark:opacity-90"
/>
```

## Usage Examples

### In Next.js Header

```tsx
import Image from "next/image";

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="container flex items-center gap-4">
        {/* Light mode - clean logo */}
        <Image
          src="/logos/light/no-grid/wordmark_horizontal.svg"
          alt="TimeTiles"
          width={270}
          height={83}
          className="dark:hidden"
        />
        {/* Dark mode - dark logo */}
        <Image
          src="/logos/dark/no-grid/wordmark_horizontal.svg"
          alt="TimeTiles"
          width={270}
          height={83}
          className="hidden dark:block"
        />
      </div>
    </header>
  );
}
```

### Hero Section with Grid Logo

```tsx
export function Hero() {
  return (
    <section className="bg-cartographic-parchment dark:bg-cartographic-navy py-24">
      <div className="container text-center">
        {/* Grid variant for visual impact */}
        <Image
          src="/logos/light/grid/logo_square.svg"
          alt="TimeTiles"
          width={200}
          height={200}
          className="mx-auto dark:hidden"
        />
        <Image
          src="/logos/dark/grid/logo_square.svg"
          alt="TimeTiles"
          width={200}
          height={200}
          className="mx-auto hidden dark:block"
        />
        <h1 className="font-serif text-5xl mt-8">
          Visualize Events in Time and Space
        </h1>
      </div>
    </section>
  );
}
```

**Note**: The grid folder has the same file names (`logo_square.svg`, `wordmark_compact.svg`, `wordmark_horizontal.svg`) as the no-grid folder.

### Favicon Implementation

```html
<!-- In app/layout.tsx or public/index.html -->
<link rel="icon" type="image/x-icon" href="/logos/light/no-grid/png/favicon.ico" media="(prefers-color-scheme: light)" />
<link rel="icon" type="image/x-icon" href="/logos/dark/no-grid/png/favicon.ico" media="(prefers-color-scheme: dark)" />

<!-- PNG fallbacks -->
<link rel="icon" type="image/png" sizes="32x32" href="/logos/light/no-grid/png/logo_square_32.png" media="(prefers-color-scheme: light)" />
<link rel="icon" type="image/png" sizes="32x32" href="/logos/dark/no-grid/png/logo_square_32.png" media="(prefers-color-scheme: dark)" />
```

## Available PNG Sizes

All logo formats (square, compact, horizontal) are exported in multiple sizes:

**Square & Compact**: 16, 32, 48, 64, 128, 256, 512, 1024, 2000px
**Horizontal**: 320w, 640w, 1280w, 2000w
**Favicon**: Multi-resolution .ico files (16, 32, 48px embedded)

## Design System Color Reference

All logo variations use these exact design system colors:

| Element | Light Mode | Dark Mode |
|---------|------------|-----------|
| Background | Parchment `#f8f5f0` | Navy `#4a5d6e` |
| Primary tiles | Navy `#4a5d6e` | Cream `#e8d5c4` |
| Accent tiles | Blue `#5583b3` | Lightened blue `#7da3c6` |
| Text | Charcoal `#404040` | Parchment `#f8f5f0` |
| Grid overlay | Navy 15% opacity | Cream 20% opacity |

**Note**: All colors are derived from the OKLCH color space definitions in the [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) Color System section.

## Asset Locations

**Source SVG files**: `packages/assets/logos/latest/`
**In Next.js public folder**: Copy to `public/logos/` for web usage
**Import in components**: Use Next.js `<Image>` component with appropriate paths

## File Naming Convention

- **Square logo**: `logo_square.svg` / `logo_square_{size}.png`
- **Compact wordmark**: `wordmark_compact.svg` / `wordmark_compact_{size}.png`
- **Horizontal wordmark**: `wordmark_horizontal.svg` / `wordmark_horizontal_{size}.png`
- **Favicon**: `favicon.ico` (contains multiple resolutions: 16, 32, 48px)

## Quick Decision Guide

```
What am I building?
├─ Header/navigation? → wordmark_horizontal (no-grid)
├─ Hero section? → logo_square or wordmark_horizontal (grid for impact)
├─ App icon/favicon? → logo_square (no-grid)
├─ Social media? → wordmark_compact or logo_square (no-grid)
└─ Email signature? → wordmark_horizontal (no-grid)

Which folder?
├─ Clean/minimal look? → no-grid/
└─ Decorative/large display? → grid/

What size do I need?
├─ Tiny (favicon, app icons)? → 16-64px
├─ Small (UI components)? → 128-256px
├─ Medium (headers, cards)? → 512px
├─ Large (hero sections)? → 1024-2000px
└─ Responsive? → Use Next.js Image with width/height props

Light or dark mode?
├─ Implement both using conditional rendering
├─ Use `dark:hidden` and `hidden dark:block` classes
└─ Never use CSS invert for logos
```

## Related Documentation

- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) - Complete design system reference
- [THEMING.md](THEMING.md) - Multi-theme support and dark mode strategies
- [ICONS.md](ICONS.md) - Icon system documentation
