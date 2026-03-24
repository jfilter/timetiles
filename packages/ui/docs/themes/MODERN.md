# Modern Theme Reference

> Clean, contemporary design with cool blue-gray tones and an indigo primary palette.
> For general customization instructions, see [THEMING.md](../THEMING.md).

## Overview

The Modern theme replaces the default Cartographic earth-tone palette with a cooler, more neutral blue-gray color scheme. Key differences from Cartographic:

- **Indigo primary** instead of navy/terracotta
- **Sans-serif headings** (same font stack, no serif distinction)
- **Larger border radius** (0.5rem) for a friendlier feel
- **Elevated shadows** with soft multi-layer depth
- **No body texture** (all texture tokens set to `transparent`)
- **Cool gray map tiles** instead of warm parchment-toned tiles
- **Wider spacing** (`--density-gap: 1.25rem`, `--density-padding: 2rem`)

Source file: `src/themes/modern.css`

---

## Color Palette

All values use the OKLCH color space. The hue axis centers on 260 (blue-violet).

### Core Semantic Colors

| Token                  | Light                    | Dark                    | Purpose             |
| ---------------------- | ------------------------ | ----------------------- | ------------------- |
| `--background`         | `oklch(0.985 0.002 260)` | `oklch(0.13 0.01 260)`  | Page background     |
| `--foreground`         | `oklch(0.15 0.01 260)`   | `oklch(0.93 0.005 260)` | Primary text        |
| `--card`               | `oklch(1 0 0)`           | `oklch(0.17 0.01 260)`  | Elevated surfaces   |
| `--card-foreground`    | `oklch(0.15 0.01 260)`   | `oklch(0.93 0.005 260)` | Text on cards       |
| `--popover`            | `oklch(1 0 0)`           | `oklch(0.17 0.01 260)`  | Dropdown/popover bg |
| `--popover-foreground` | `oklch(0.15 0.01 260)`   | `oklch(0.93 0.005 260)` | Popover text        |

### Interactive Colors

| Token                      | Light                   | Dark                   | Purpose                       |
| -------------------------- | ----------------------- | ---------------------- | ----------------------------- |
| `--primary`                | `oklch(0.45 0.2 260)`   | `oklch(0.65 0.2 260)`  | Primary actions, headings     |
| `--primary-foreground`     | `oklch(0.98 0.005 260)` | `oklch(0.13 0.01 260)` | Text on primary bg            |
| `--secondary`              | `oklch(0.55 0.15 200)`  | `oklch(0.6 0.15 200)`  | Secondary actions             |
| `--secondary-foreground`   | `oklch(0.98 0.005 260)` | `oklch(0.13 0.01 260)` | Text on secondary bg          |
| `--accent`                 | `oklch(0.55 0.18 160)`  | `oklch(0.6 0.18 160)`  | Success, secondary highlights |
| `--accent-foreground`      | `oklch(0.98 0.005 260)` | `oklch(0.13 0.01 260)` | Text on accent bg             |
| `--destructive`            | `oklch(0.55 0.22 25)`   | `oklch(0.65 0.2 25)`   | Error, danger                 |
| `--destructive-foreground` | `oklch(0.98 0.005 260)` | `oklch(0.13 0.01 260)` | Text on destructive bg        |

### Utility Colors

| Token                | Light                   | Dark                   | Purpose           |
| -------------------- | ----------------------- | ---------------------- | ----------------- |
| `--muted`            | `oklch(0.95 0.005 260)` | `oklch(0.2 0.01 260)`  | Muted backgrounds |
| `--muted-foreground` | `oklch(0.45 0.02 260)`  | `oklch(0.65 0.02 260)` | Placeholder text  |
| `--border`           | `oklch(0.91 0.005 260)` | `oklch(0.25 0.01 260)` | Default borders   |
| `--input`            | `oklch(0.91 0.005 260)` | `oklch(0.25 0.01 260)` | Input borders     |
| `--ring`             | `oklch(0.55 0.2 260)`   | `oklch(0.65 0.2 260)`  | Focus rings       |

### Sidebar Colors

| Token                          | Light                    | Dark                    |
| ------------------------------ | ------------------------ | ----------------------- |
| `--sidebar`                    | `oklch(0.975 0.003 260)` | `oklch(0.15 0.01 260)`  |
| `--sidebar-foreground`         | `oklch(0.15 0.01 260)`   | `oklch(0.93 0.005 260)` |
| `--sidebar-primary`            | `oklch(0.45 0.2 260)`    | `oklch(0.65 0.2 260)`   |
| `--sidebar-primary-foreground` | `oklch(0.98 0.005 260)`  | `oklch(0.13 0.01 260)`  |
| `--sidebar-accent`             | `oklch(0.55 0.2 260)`    | `oklch(0.65 0.2 260)`   |
| `--sidebar-accent-foreground`  | `oklch(0.98 0.005 260)`  | `oklch(0.13 0.01 260)`  |
| `--sidebar-border`             | `oklch(0.91 0.005 260)`  | `oklch(0.25 0.01 260)`  |
| `--sidebar-ring`               | `oklch(0.55 0.2 260)`    | `oklch(0.65 0.2 260)`   |

### Chart Colors (CSS tokens)

| Token       | Light                  | Dark                   |
| ----------- | ---------------------- | ---------------------- |
| `--chart-1` | `oklch(0.55 0.2 260)`  | `oklch(0.65 0.2 260)`  |
| `--chart-2` | `oklch(0.55 0.15 200)` | `oklch(0.6 0.15 200)`  |
| `--chart-3` | `oklch(0.55 0.18 160)` | `oklch(0.6 0.18 160)`  |
| `--chart-4` | `oklch(0.45 0.2 260)`  | `oklch(0.55 0.2 260)`  |
| `--chart-5` | `oklch(0.6 0.15 300)`  | `oklch(0.65 0.15 300)` |

### Categorical Palette (dataset badges)

| Token          | Light                  | Dark                   |
| -------------- | ---------------------- | ---------------------- |
| `--palette-1`  | `oklch(0.55 0.2 260)`  | `oklch(0.65 0.2 260)`  |
| `--palette-2`  | `oklch(0.55 0.15 200)` | `oklch(0.6 0.15 200)`  |
| `--palette-3`  | `oklch(0.55 0.18 160)` | `oklch(0.6 0.18 160)`  |
| `--palette-4`  | `oklch(0.6 0.12 190)`  | `oklch(0.65 0.12 190)` |
| `--palette-5`  | `oklch(0.6 0.15 70)`   | `oklch(0.65 0.15 70)`  |
| `--palette-6`  | `oklch(0.5 0.15 310)`  | `oklch(0.6 0.15 310)`  |
| `--palette-7`  | `oklch(0.6 0.15 20)`   | `oklch(0.65 0.15 20)`  |
| `--palette-8`  | `oklch(0.55 0.1 140)`  | `oklch(0.6 0.1 140)`   |
| `--palette-9`  | `oklch(0.4 0.15 270)`  | `oklch(0.5 0.15 270)`  |
| `--palette-10` | `oklch(0.5 0.03 260)`  | `oklch(0.6 0.03 260)`  |

---

## Typography

The Modern theme uses sans-serif for both headings and body text:

```css
--heading-font: var(--font-sans);
```

This produces a uniform typographic voice. Headings, body text, and UI labels all render in the same sans-serif family (DM Sans by default). The Cartographic theme uses `var(--font-serif)` for headings to create more visual contrast between titles and body copy.

The underlying font stack is unchanged. Override `--font-sans`, `--font-serif`, and `--font-mono` in your layout to use different typefaces.

---

## Border Radius

```css
--radius: 0.5rem;
```

This is the base value that Tailwind utilities (`rounded-sm`, `rounded-md`, `rounded-lg`) scale from. At 0.5rem the UI feels rounded and approachable. Compare with Cartographic's 0.5rem default -- both themes currently share this value, but it can be overridden per-theme.

---

## Shadows

The Modern theme uses elevated, soft multi-layer shadows for card depth:

```css
/* Resting state — subtle dual-layer */
--shadow-card: 0 1px 3px oklch(0 0 0 / 0.08), 0 1px 2px oklch(0 0 0 / 0.04);

/* Hover state — lifted, wider spread */
--shadow-card-hover: 0 8px 25px oklch(0 0 0 / 0.12);
```

The resting shadow is a two-layer composite: a sharper 3px blur for definition and a softer 2px blur for fill. On hover, cards lift to a single 25px blur with 12% opacity, creating a clear sense of elevation. This is noticeably more pronounced than Cartographic's minimal single-layer shadows (`0 1px 2px` resting, `0 4px 12px` hover).

---

## Layout Density

The Modern theme uses wider spacing than Cartographic:

| Token               | Modern    | Cartographic |
| ------------------- | --------- | ------------ |
| `--density-gap`     | `1.25rem` | `1rem`       |
| `--density-padding` | `2rem`    | `1.5rem`     |

This gives the Modern layout more breathing room, reinforcing the clean, spacious aesthetic.

---

## Body Texture

The Modern theme disables the body background pattern entirely:

```css
--texture-tint: transparent;
--texture-accent: transparent;
--texture-line: transparent;
```

The result is a flat, solid background. The Cartographic theme uses these tokens to render a subtle parchment-like grid pattern.

---

## Chart Colors

Chart colors are defined in `apps/web/lib/constants/theme-presets.ts` as hex values for ECharts rendering.

### Light Mode

| Property            | Hex         | Usage                                  |
| ------------------- | ----------- | -------------------------------------- |
| `itemColor`         | `#4f46e5`   | Bar/line fill (indigo-600)             |
| `emphasisColor`     | `#3730a3`   | Highlighted/selected data (indigo-800) |
| `textColor`         | `#1e293b`   | Axis labels, legend text (slate-800)   |
| `axisLineColor`     | `#1e293b40` | Axis lines (25% opacity)               |
| `splitLineColor`    | `#1e293b15` | Grid lines (8% opacity)                |
| `tooltipBackground` | `#f8fafc`   | Tooltip background (slate-50)          |
| `tooltipForeground` | `#1e293b`   | Tooltip text (slate-800)               |

### Dark Mode

| Property            | Hex         | Usage                          |
| ------------------- | ----------- | ------------------------------ |
| `itemColor`         | `#818cf8`   | Bar/line fill (indigo-400)     |
| `emphasisColor`     | `#6366f1`   | Highlighted data (indigo-500)  |
| `textColor`         | `#e2e8f0`   | Axis labels (slate-200)        |
| `axisLineColor`     | `#e2e8f066` | Axis lines (40% opacity)       |
| `splitLineColor`    | `#e2e8f033` | Grid lines (20% opacity)       |
| `tooltipBackground` | `#1e293b`   | Tooltip background (slate-800) |
| `tooltipForeground` | `#e2e8f0`   | Tooltip text (slate-200)       |

### Map Colors

| Property             | Hex                                                           | Usage                                           |
| -------------------- | ------------------------------------------------------------- | ----------------------------------------------- |
| `mapPoint`           | `#4f46e5`                                                     | Individual event marker (indigo-600)            |
| `mapStroke`          | `#ffffff`                                                     | Marker/cluster outline                          |
| `mapClusterGradient` | `#c7d2fe` -> `#a5b4fc` -> `#818cf8` -> `#6366f1` -> `#4338ca` | 5-stop gradient (indigo-200 through indigo-700) |

---

## Map Tile Style

The Modern theme loads dedicated cool-gray map tile styles:

| Mode  | Style file                      |
| ----- | ------------------------------- |
| Light | `/map-styles/modern-light.json` |
| Dark  | `/map-styles/modern-dark.json`  |

These are MapLibre GL JSON style files with a neutral gray base map that complements the indigo data overlay. The Cartographic theme uses warmer, parchment-toned tiles instead.

Map style paths are configured in `apps/web/lib/constants/map.ts` via `MAP_STYLES_BY_PRESET`.

---

## How to Activate

### Option 1: CSS class (manual)

Add `.theme-modern` to your `<html>` element:

```html
<html class="theme-modern"></html>
```

For dark mode, combine with the `.dark` class:

```html
<html class="theme-modern dark"></html>
```

### Option 2: Theme preset picker (TimeTiles app)

The `useThemePreset()` hook manages the active preset at runtime. It persists the selection to `localStorage` under the key `timetiles-theme-preset` and applies the `.theme-modern` class automatically.

```tsx
import { useThemePreset } from "@/lib/hooks/use-theme-preset";

function ThemeSwitcher() {
  const { preset, setPreset, presets } = useThemePreset();

  return (
    <select value={preset} onChange={(e) => setPreset(e.target.value)}>
      {presets.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
    </select>
  );
}
```

### Option 3: Import the CSS directly

If you use `@timetiles/ui` outside the TimeTiles app, import the theme file and apply the class:

```tsx
import "@timetiles/ui/themes/modern.css";

<html className="theme-modern">
```

---

## Full CSS Variable Reference

For the complete token list (light + dark), see the source file:
`packages/ui/src/themes/modern.css`

For the semantic token reference and UIProvider API, see [THEMING.md](../THEMING.md).
