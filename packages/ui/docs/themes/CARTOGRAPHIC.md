# Cartographic Theme Reference

> The default theme for `@timetiles/ui`. An earth-tone palette inspired by vintage cartography, editorial maps, and geographic information systems.
>
> For customization instructions (creating your own theme, overriding tokens), see [../THEMING.md](../THEMING.md).

---

## Overview

The Cartographic theme draws from the visual language of hand-drawn maps and atlas publishing. Warm parchment backgrounds, ink-dark text, and geographic accent colors (ocean blue, terracotta land, forest green) create an interface that feels both precise and human.

Key characteristics:

- **OKLCH color space** for perceptual uniformity across light and dark modes
- **Minimal border radius** (0.125rem) evoking technical precision
- **Serif headings** paired with geometric sans body text
- **Subtle paper texture** on the page background
- **Custom map tiles** with warm, parchment-toned cartography

---

## Color Palette

### Primary Colors (7)

These define the core identity. All values shown are light mode; dark mode equivalents follow in the [Design Tokens](#design-tokens) section.

| Name       | CSS Variable                | OKLCH (Light)          | Hex Approx. | Semantic Role                            |
| ---------- | --------------------------- | ---------------------- | ----------- | ---------------------------------------- |
| Parchment  | `--cartographic-parchment`  | `oklch(0.96 0.01 80)`  | `#f8f5f0`   | Page background, neutral base            |
| Charcoal   | `--cartographic-charcoal`   | `oklch(0.25 0 0)`      | `#404040`   | Primary text, headings                   |
| Navy       | `--cartographic-navy`       | `oklch(0.35 0.06 250)` | `#4a5568`   | Primary actions, navigation, depth       |
| Blue       | `--cartographic-blue`       | `oklch(0.58 0.11 220)` | `#0089a7`   | Interactive elements, links, focus rings |
| Terracotta | `--cartographic-terracotta` | `oklch(0.56 0.14 35)`  | `#cd853f`   | Warm accents, feature highlights         |
| Forest     | `--cartographic-forest`     | `oklch(0.42 0.08 145)` | `#5f9e6e`   | Success states, secondary accents        |
| Cream      | `--cartographic-cream`      | `oklch(0.88 0.01 80)`  | `#e8e4dd`   | Card backgrounds, elevated surfaces      |

### Extended Colors (6)

Used for dataset badges and categorical distinction. These map to `--palette-4` through `--palette-10` (alongside the primary colors that fill slots 1-3 and 9).

| Name  | CSS Variable           | OKLCH (Light)          | Usage          |
| ----- | ---------------------- | ---------------------- | -------------- |
| Teal  | `--cartographic-teal`  | `oklch(0.52 0.1 185)`  | `--palette-4`  |
| Amber | `--cartographic-amber` | `oklch(0.62 0.15 70)`  | `--palette-5`  |
| Plum  | `--cartographic-plum`  | `oklch(0.45 0.12 320)` | `--palette-6`  |
| Slate | `--cartographic-slate` | `oklch(0.48 0.02 260)` | `--palette-10` |
| Rose  | `--cartographic-rose`  | `oklch(0.55 0.14 10)`  | `--palette-7`  |
| Olive | `--cartographic-olive` | `oklch(0.5 0.08 110)`  | `--palette-8`  |

### Categorical Palette Mapping

The 10-slot `--palette-*` system assigns colors for dataset badges and data distinction:

| Slot           | Source Variable             |
| -------------- | --------------------------- |
| `--palette-1`  | `--cartographic-blue`       |
| `--palette-2`  | `--cartographic-terracotta` |
| `--palette-3`  | `--cartographic-forest`     |
| `--palette-4`  | `--cartographic-teal`       |
| `--palette-5`  | `--cartographic-amber`      |
| `--palette-6`  | `--cartographic-plum`       |
| `--palette-7`  | `--cartographic-rose`       |
| `--palette-8`  | `--cartographic-olive`      |
| `--palette-9`  | `--cartographic-navy`       |
| `--palette-10` | `--cartographic-slate`      |

---

## Typography

The Cartographic theme uses a three-font system that mirrors editorial cartography: decorative serif for display, clean sans for body, and monospace for data.

| Role                          | Font Family      | CSS Variable   | Weights          |
| ----------------------------- | ---------------- | -------------- | ---------------- |
| Headings, display text        | Playfair Display | `--font-serif` | 400, 700         |
| Body text, UI labels, forms   | DM Sans          | `--font-sans`  | Variable 400-700 |
| Code, statistics, coordinates | Space Mono       | `--font-mono`  | 400, 700         |

Heading elements (`h1`-`h4`) use `font-serif`. The `--heading-font` variable is set to `var(--font-serif)`.

### Type scale summary

| Use              | Tailwind                 | Font                                                   |
| ---------------- | ------------------------ | ------------------------------------------------------ |
| Hero headlines   | `text-5xl` to `text-7xl` | `font-serif font-bold`                                 |
| Section headings | `text-2xl` to `text-4xl` | `font-serif font-bold`                                 |
| Subheadings      | `text-lg` to `text-xl`   | `font-serif font-semibold` / `font-sans font-semibold` |
| Body text        | `text-base`              | `font-sans font-normal`                                |
| Captions, labels | `text-xs` to `text-sm`   | `font-sans font-normal`                                |
| Data, code       | `text-sm`                | `font-mono font-normal`                                |

---

## Border Radius

```css
--radius: 0.125rem;
```

This is deliberately minimal. Sharp corners evoke the precision of technical drawings and cartographic instruments. The `--radius` token feeds Tailwind's `rounded-*` utilities:

| Utility        | Computed Value | Use                                     |
| -------------- | -------------- | --------------------------------------- |
| `rounded-sm`   | ~2px           | Buttons, inputs, cards                  |
| `rounded-md`   | ~4px           | Modals, larger containers               |
| `rounded-none` | 0px            | Data visualizations, technical elements |

---

## Shadows

The Cartographic theme prefers **borders over elevation**. Shadows are subtle and used sparingly.

| Token                 | Value                           | Use            |
| --------------------- | ------------------------------- | -------------- |
| `--shadow-card`       | `0 1px 2px oklch(0 0 0 / 0.05)` | Cards at rest  |
| `--shadow-card-hover` | `0 4px 12px oklch(0 0 0 / 0.1)` | Cards on hover |

General guidance:

- `shadow-xs` for buttons and inputs (minimal lift)
- `shadow-sm` for cards in default state
- `shadow-md` for elevated cards and dropdowns
- `shadow-lg` for modals and prominent overlays (use rarely)

---

## Body Texture

The page background includes a subtle paper-like texture built from three layered CSS gradients. This creates the impression of aged parchment without using image assets.

### Texture variables

| Token              | Light Mode Value                | Dark Mode Value                 | Purpose                   |
| ------------------ | ------------------------------- | ------------------------------- | ------------------------- |
| `--texture-tint`   | `var(--cartographic-parchment)` | `var(--cartographic-parchment)` | Soft radial glow tint     |
| `--texture-accent` | `var(--cartographic-blue)`      | `var(--cartographic-blue)`      | Secondary radial accent   |
| `--texture-line`   | `var(--cartographic-charcoal)`  | `var(--cartographic-charcoal)`  | Fine repeating grid lines |

### How it works

The `body` element receives three stacked `background-image` layers with `background-attachment: fixed`:

1. **Radial glow** (20% from left, 50% vertical) -- a warm tint at 40% opacity fading to transparent, simulating uneven paper aging.
2. **Accent glow** (80% from left, 20% vertical) -- a cool blue accent at 8% opacity, adding depth.
3. **Repeating grid** -- 2px transparent / 2px line at 1% opacity, creating the faint ruling of graph paper.

To disable the texture entirely, set all three tokens to `transparent`.

---

## Design Tokens

### Light Mode (`:root`)

#### Base palette

| Variable                          | Value                  |
| --------------------------------- | ---------------------- |
| `--cartographic-parchment`        | `oklch(0.96 0.01 80)`  |
| `--cartographic-charcoal`         | `oklch(0.25 0 0)`      |
| `--cartographic-navy`             | `oklch(0.35 0.06 250)` |
| `--cartographic-blue`             | `oklch(0.58 0.11 220)` |
| `--cartographic-terracotta`       | `oklch(0.56 0.14 35)`  |
| `--cartographic-forest`           | `oklch(0.42 0.08 145)` |
| `--cartographic-cream`            | `oklch(0.88 0.01 80)`  |
| `--cartographic-muted`            | `oklch(0.93 0.01 80)`  |
| `--cartographic-muted-foreground` | `oklch(0.45 0.04 250)` |
| `--cartographic-destructive`      | `oklch(0.45 0.22 25)`  |
| `--cartographic-border`           | `oklch(0.88 0.01 250)` |
| `--cartographic-chart-5`          | `oklch(0.65 0.12 300)` |

#### Extended palette

| Variable               | Value                  |
| ---------------------- | ---------------------- |
| `--cartographic-teal`  | `oklch(0.52 0.1 185)`  |
| `--cartographic-amber` | `oklch(0.62 0.15 70)`  |
| `--cartographic-plum`  | `oklch(0.45 0.12 320)` |
| `--cartographic-slate` | `oklch(0.48 0.02 260)` |
| `--cartographic-rose`  | `oklch(0.55 0.14 10)`  |
| `--cartographic-olive` | `oklch(0.5 0.08 110)`  |

#### Semantic token mapping

| Semantic Token             | Maps To                           |
| -------------------------- | --------------------------------- |
| `--background`             | `--cartographic-parchment`        |
| `--foreground`             | `--cartographic-charcoal`         |
| `--card`                   | `--cartographic-cream`            |
| `--card-foreground`        | `--cartographic-charcoal`         |
| `--popover`                | `--cartographic-cream`            |
| `--popover-foreground`     | `--cartographic-charcoal`         |
| `--primary`                | `--cartographic-navy`             |
| `--primary-foreground`     | `--cartographic-parchment`        |
| `--secondary`              | `--cartographic-terracotta`       |
| `--secondary-foreground`   | `--cartographic-parchment`        |
| `--muted`                  | `--cartographic-muted`            |
| `--muted-foreground`       | `--cartographic-muted-foreground` |
| `--accent`                 | `--cartographic-forest`           |
| `--accent-foreground`      | `--cartographic-parchment`        |
| `--destructive`            | `--cartographic-destructive`      |
| `--destructive-foreground` | `--cartographic-parchment`        |
| `--border`                 | `--cartographic-border`           |
| `--input`                  | `--cartographic-border`           |
| `--ring`                   | `--cartographic-blue`             |
| `--chart-1`                | `--cartographic-blue`             |
| `--chart-2`                | `--cartographic-terracotta`       |
| `--chart-3`                | `--cartographic-forest`           |
| `--chart-4`                | `--cartographic-navy`             |
| `--chart-5`                | `--cartographic-chart-5`          |

#### Layout tokens

| Token                 | Value                           |
| --------------------- | ------------------------------- |
| `--radius`            | `0.125rem`                      |
| `--shadow-card`       | `0 1px 2px oklch(0 0 0 / 0.05)` |
| `--shadow-card-hover` | `0 4px 12px oklch(0 0 0 / 0.1)` |
| `--heading-font`      | `var(--font-serif)`             |
| `--density-gap`       | `1rem`                          |
| `--density-padding`   | `1.5rem`                        |

### Dark Mode (`.dark`)

#### Base palette

| Variable                          | Value                  |
| --------------------------------- | ---------------------- |
| `--cartographic-parchment`        | `oklch(0.15 0.01 250)` |
| `--cartographic-charcoal`         | `oklch(0.88 0.01 80)`  |
| `--cartographic-navy`             | `oklch(0.65 0.09 230)` |
| `--cartographic-blue`             | `oklch(0.62 0.12 210)` |
| `--cartographic-terracotta`       | `oklch(0.62 0.16 30)`  |
| `--cartographic-forest`           | `oklch(0.6 0.1 145)`   |
| `--cartographic-cream`            | `oklch(0.28 0.01 250)` |
| `--cartographic-muted`            | `oklch(0.22 0.01 250)` |
| `--cartographic-muted-foreground` | `oklch(0.68 0.04 230)` |
| `--cartographic-destructive`      | `oklch(0.7 0.2 25)`    |
| `--cartographic-border`           | `oklch(0.28 0.01 250)` |
| `--cartographic-chart-5`          | `oklch(0.65 0.12 300)` |

#### Extended palette

| Variable               | Value                  |
| ---------------------- | ---------------------- |
| `--cartographic-teal`  | `oklch(0.58 0.11 185)` |
| `--cartographic-amber` | `oklch(0.68 0.16 70)`  |
| `--cartographic-plum`  | `oklch(0.55 0.14 320)` |
| `--cartographic-slate` | `oklch(0.58 0.03 260)` |
| `--cartographic-rose`  | `oklch(0.62 0.15 10)`  |
| `--cartographic-olive` | `oklch(0.58 0.09 110)` |

The semantic token mapping is identical in dark mode -- the same `var()` references resolve to the adjusted dark palette values above.

---

## Chart Colors

Chart components use the `defaultColors` object from `src/lib/chart-themes.ts`. These are hex values for ECharts compatibility.

### Base chart colors

| Name       | Hex       | Matching OKLCH         |
| ---------- | --------- | ---------------------- |
| parchment  | `#f8f5f0` | `oklch(0.96 0.01 80)`  |
| charcoal   | `#404040` | `oklch(0.25 0 0)`      |
| navy       | `#4a5568` | `oklch(0.35 0.06 250)` |
| blue       | `#0089a7` | `oklch(0.58 0.11 220)` |
| terracotta | `#cd853f` | `oklch(0.56 0.14 35)`  |
| forest     | `#5f9e6e` | `oklch(0.42 0.08 145)` |
| cream      | `#e8e4dd` | `oklch(0.88 0.01 80)`  |

### Light theme assignments

| Property            | Value                  | Purpose                  |
| ------------------- | ---------------------- | ------------------------ |
| `textColor`         | `#404040` (charcoal)   | Axis labels, legend text |
| `axisLineColor`     | `#4a55684D` (navy 30%) | Axis lines               |
| `splitLineColor`    | `#4a55681A` (navy 10%) | Grid lines               |
| `itemColor`         | `#0089a7` (blue)       | Bar/line default color   |
| `tooltipBackground` | `#f8f5f0` (parchment)  | Tooltip background       |
| `tooltipForeground` | `#404040` (charcoal)   | Tooltip text             |
| `emphasisColor`     | `#4a5568` (navy)       | Highlighted items        |

### Dark theme assignments

| Property            | Value                      | Purpose                  |
| ------------------- | -------------------------- | ------------------------ |
| `textColor`         | `#404040` (charcoal)       | Axis labels, legend text |
| `axisLineColor`     | `#40404066` (charcoal 40%) | Axis lines               |
| `splitLineColor`    | `#40404033` (charcoal 20%) | Grid lines               |
| `itemColor`         | `#0089a7` (blue)           | Bar/line default color   |
| `tooltipBackground` | `#404040` (charcoal)       | Tooltip background       |
| `tooltipForeground` | `#f8f5f0` (parchment)      | Tooltip text             |
| `emphasisColor`     | `#4a5568` (navy)           | Highlighted items        |

### Map visualization colors

| Property                | Value            | Purpose                                     |
| ----------------------- | ---------------- | ------------------------------------------- |
| `mapPoint`              | `#0089a7` (blue) | Individual event markers                    |
| `mapStroke`             | `#ffffff`        | Circle outlines                             |
| `mapClusterGradient[0]` | `#f0dcc6`        | Cluster density p0-p20 (warm cream)         |
| `mapClusterGradient[1]` | `#d4a55a`        | Cluster density p20-p40 (golden terracotta) |
| `mapClusterGradient[2]` | `#b87333`        | Cluster density p40-p60 (copper/bronze)     |
| `mapClusterGradient[3]` | `#8b4513`        | Cluster density p60-p80 (saddle brown)      |
| `mapClusterGradient[4]` | `#5c2d0e`        | Cluster density p80-p100 (dark chocolate)   |

Override chart and map colors via `UIProvider`'s `lightChartTheme`, `darkChartTheme`, and `mapColors` props. See [../THEMING.md](../THEMING.md) for examples.

---

## Map Tile Style

The Cartographic theme includes two MapLibre GL style files for the base map:

| File                      | Background             | Water                 | Purpose    |
| ------------------------- | ---------------------- | --------------------- | ---------- |
| `cartographic-light.json` | `#f8f5f0` (parchment)  | `#b8dce8` (soft blue) | Light mode |
| `cartographic-dark.json`  | `#1a1a1a` (near black) | `#1a3a4a` (deep blue) | Dark mode  |

Both files:

- Use **VersaTiles** as the vector tile source (OpenStreetMap data)
- Are generated by `scripts/generate-map-style.ts` using the shared `defaultColors` palette
- Live in `apps/web/public/map-styles/`
- Follow the MapLibre Style Specification v8

The light style renders land in warm parchment tones, water in muted blue, and roads/labels in navy and charcoal. The overall impression is of a printed atlas page rather than a satellite or digital map.

To generate custom map styles for a new theme, run the generation script with different base colors. See the "Customizable with code changes" section in [../THEMING.md](../THEMING.md).

---

## Source Files

| File                                                 | Contents                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/themes/cartographic.css`                        | All `--cartographic-*` variables, semantic mappings, light + dark                        |
| `src/lib/chart-themes.ts`                            | `defaultColors` hex palette, `defaultLightTheme`, `defaultDarkTheme`, `defaultMapColors` |
| `src/styles/globals.css`                             | Body texture gradients, base Tailwind layer                                              |
| `apps/web/public/map-styles/cartographic-light.json` | Light mode MapLibre style                                                                |
| `apps/web/public/map-styles/cartographic-dark.json`  | Dark mode MapLibre style                                                                 |
