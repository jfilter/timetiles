# Theming & Customization Guide

> How to customize the look of `@timetiles/ui` and the TimeTiles web application.
> All components use semantic CSS tokens — switch the entire visual identity by redefining CSS variables.

## Architecture Overview

```
Base palette (OKLCH values)
  └── Semantic tokens (--primary, --background, ...)
        └── Tailwind utilities (bg-primary, text-foreground, ...)
              └── Components (Button, Card, Header, ...)
```

Components **never** reference the base palette directly. They use semantic tokens like `bg-primary`, `text-foreground`, `border-border`. Swapping a theme means redefining the semantic tokens — every component adapts automatically.

---

## Quick Start: Creating a Second Theme

### 1. Define your theme CSS

Create a CSS file that redefines the semantic tokens:

```css
/* themes/ocean.css */
.theme-ocean {
  --background: oklch(0.97 0.01 220);
  --foreground: oklch(0.2 0.02 230);
  --card: oklch(0.95 0.02 215);
  --card-foreground: oklch(0.2 0.02 230);
  --popover: oklch(0.95 0.02 215);
  --popover-foreground: oklch(0.2 0.02 230);
  --primary: oklch(0.45 0.15 240);
  --primary-foreground: oklch(0.97 0.01 220);
  --secondary: oklch(0.55 0.12 180);
  --secondary-foreground: oklch(0.97 0.01 220);
  --muted: oklch(0.92 0.02 220);
  --muted-foreground: oklch(0.45 0.03 230);
  --accent: oklch(0.5 0.14 160);
  --accent-foreground: oklch(0.97 0.01 220);
  --destructive: oklch(0.5 0.2 25);
  --destructive-foreground: oklch(0.97 0.01 220);
  --border: oklch(0.88 0.02 220);
  --input: oklch(0.88 0.02 220);
  --ring: oklch(0.55 0.15 240);
  --chart-1: oklch(0.55 0.15 240);
  --chart-2: oklch(0.55 0.12 180);
  --chart-3: oklch(0.5 0.14 160);
  --chart-4: oklch(0.45 0.15 240);
  --chart-5: oklch(0.6 0.1 280);
  --radius: 0.5rem;

  /* Sidebar */
  --sidebar: oklch(0.95 0.02 215);
  --sidebar-foreground: oklch(0.2 0.02 230);
  --sidebar-primary: oklch(0.45 0.15 240);
  --sidebar-primary-foreground: oklch(0.97 0.01 220);
  --sidebar-accent: oklch(0.55 0.15 240);
  --sidebar-accent-foreground: oklch(0.97 0.01 220);
  --sidebar-border: oklch(0.88 0.02 220);
  --sidebar-ring: oklch(0.55 0.15 240);

  /* Categorical palette for dataset badges */
  --palette-1: oklch(0.55 0.15 240);
  --palette-2: oklch(0.55 0.12 180);
  --palette-3: oklch(0.5 0.14 160);
  --palette-4: oklch(0.6 0.12 200);
  --palette-5: oklch(0.6 0.14 60);
  --palette-6: oklch(0.5 0.12 300);
  --palette-7: oklch(0.55 0.14 10);
  --palette-8: oklch(0.5 0.08 140);
  --palette-9: oklch(0.45 0.1 250);
  --palette-10: oklch(0.5 0.03 230);

  /* Body texture tints */
  --texture-tint: var(--background);
  --texture-accent: var(--ring);
  --texture-line: var(--foreground);
}
```

### 2. Apply the theme

```tsx
// In your layout or root component
import "./themes/ocean.css";

export default function Layout({ children }) {
  return (
    <html className="theme-ocean">
      <body>{children}</body>
    </html>
  );
}
```

### 3. Configure the UIProvider for charts and maps

```tsx
import { UIProvider } from "@timetiles/ui/provider";
import type { ChartTheme } from "@timetiles/ui/charts";
import type { MapColors } from "@timetiles/ui/lib/chart-themes";

const oceanChartTheme: ChartTheme = {
  backgroundColor: "transparent",
  textColor: "#1a3050",
  axisLineColor: "#1a305040",
  splitLineColor: "#1a305015",
  itemColor: "#2563eb",
  tooltipBackground: "#f0f7ff",
  tooltipForeground: "#1a3050",
  emphasisColor: "#1e40af",
};

const oceanMapColors: MapColors = {
  mapPoint: "#2563eb",
  mapClusterGradient: ["#dbeafe", "#93c5fd", "#3b82f6", "#1d4ed8", "#1e3a5f"],
  mapStroke: "#ffffff",
};

<UIProvider
  resolveTheme={() => theme ?? "light"}
  lightChartTheme={oceanChartTheme}
  darkChartTheme={oceanDarkChartTheme}
  mapColors={oceanMapColors}
>
  {children}
</UIProvider>;
```

That's it. Every component — buttons, cards, headers, footers, charts, maps, dataset badges — renders in ocean colors.

---

## Semantic Token Reference

### Core tokens

Every theme **must** define these. All components depend on them.

| Token                      | Purpose                       | Example usage                 |
| -------------------------- | ----------------------------- | ----------------------------- |
| `--background`             | Page background               | `bg-background`               |
| `--foreground`             | Primary text                  | `text-foreground`             |
| `--card`                   | Elevated surfaces             | `bg-card`                     |
| `--card-foreground`        | Text on cards                 | `text-card-foreground`        |
| `--popover`                | Dropdown/popover bg           | `bg-popover`                  |
| `--popover-foreground`     | Popover text                  | `text-popover-foreground`     |
| `--primary`                | Primary actions, headings     | `bg-primary`, `text-primary`  |
| `--primary-foreground`     | Text on primary bg            | `text-primary-foreground`     |
| `--secondary`              | Secondary actions, highlights | `bg-secondary`                |
| `--secondary-foreground`   | Text on secondary bg          | `text-secondary-foreground`   |
| `--muted`                  | Muted backgrounds             | `bg-muted`                    |
| `--muted-foreground`       | Muted/placeholder text        | `text-muted-foreground`       |
| `--accent`                 | Success, secondary actions    | `bg-accent`, `text-accent`    |
| `--accent-foreground`      | Text on accent bg             | `text-accent-foreground`      |
| `--destructive`            | Error, danger                 | `bg-destructive`              |
| `--destructive-foreground` | Text on destructive bg        | `text-destructive-foreground` |
| `--border`                 | Default borders               | `border-border`               |
| `--input`                  | Input borders                 | `border-input`                |
| `--ring`                   | Focus rings, interactive      | `ring-ring`, `text-ring`      |
| `--radius`                 | Border radius base            | `rounded-lg` etc.             |

### Chart tokens

Used by chart components (via `@theme inline`):

| Token                           | Purpose                   |
| ------------------------------- | ------------------------- |
| `--chart-1` through `--chart-5` | Data visualization colors |

### Palette tokens

Used by dataset badges and categorical data:

| Token                                | Purpose                                             |
| ------------------------------------ | --------------------------------------------------- |
| `--palette-1` through `--palette-10` | Distinct colors for dataset/category identification |

### Sidebar tokens

Used by sidebar navigation:

| Token                                               | Purpose                 |
| --------------------------------------------------- | ----------------------- |
| `--sidebar`, `--sidebar-foreground`                 | Sidebar background/text |
| `--sidebar-primary`, `--sidebar-primary-foreground` | Active sidebar item     |
| `--sidebar-accent`, `--sidebar-accent-foreground`   | Hover state             |
| `--sidebar-border`, `--sidebar-ring`                | Borders/focus           |

### Texture tokens

Control the subtle body background pattern:

| Token              | Purpose                   |
| ------------------ | ------------------------- |
| `--texture-tint`   | Soft radial glow tint     |
| `--texture-accent` | Secondary radial accent   |
| `--texture-line`   | Fine repeating grid lines |

Set all three to `transparent` to disable the texture effect entirely.

### Fonts

Components use Tailwind's generic font classes — not hardcoded font names:

| Class        | CSS variable   | Default (Cartographic) | Controls                          |
| ------------ | -------------- | ---------------------- | --------------------------------- |
| `font-serif` | `--font-serif` | Playfair Display       | Headings, titles, brand text      |
| `font-sans`  | `--font-sans`  | DM Sans                | Body text, UI elements, labels    |
| `font-mono`  | `--font-mono`  | Space Mono             | Coordinates, code, version labels |

To use different fonts, load them in your layout (e.g., via `next/font`) and set the CSS variables:

```tsx
import { Inter, Merriweather, JetBrains_Mono } from "next/font/google";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const serif = Merriweather({ subsets: ["latin"], variable: "--font-serif" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

<body className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
```

The typographic hierarchy is fixed: `font-serif` for headings, `font-sans` for body, `font-mono` for data. A theme controls which specific fonts fill those roles.

---

## UIProvider API

The `UIProvider` component configures runtime behavior that CSS alone can't control.

```tsx
import { UIProvider } from "@timetiles/ui/provider";

<UIProvider
  resolveTheme={() => "light" | "dark"}
  lightChartTheme={ChartTheme}
  darkChartTheme={ChartTheme}
  mapColors={MapColors}
  onNewsletterSubmit={(email, data) => Promise<void>}
>
```

### `resolveTheme`

Returns the current theme mode (`"light"` or `"dark"`). Used by chart components to pick the right color scheme.

If omitted, defaults to `"light"`.

### `lightChartTheme` / `darkChartTheme`

Override ECharts colors for light and dark modes. Falls back to the built-in defaults.

```typescript
interface ChartTheme {
  backgroundColor?: string;
  textColor?: string;
  axisLineColor?: string;
  splitLineColor?: string;
  itemColor?: string | string[];
  tooltipBackground?: string;
  tooltipForeground?: string;
  emphasisColor?: string;
}
```

### `mapColors`

Override MapLibre point and cluster visualization colors.

```typescript
interface MapColors {
  mapPoint: string; // Individual event point color
  mapClusterGradient: readonly [string, string, string, string, string]; // 5-level cluster gradient
  mapStroke: string; // Circle stroke color
}
```

### `onNewsletterSubmit`

Custom newsletter submission handler. When omitted, components fall back to `POST /api/newsletter/subscribe`.

---

## Dark Mode

Dark mode is controlled by the `.dark` class on `<html>`. The default theme defines both `:root` (light) and `.dark` (dark) token sets.

For custom themes, define a dark variant:

```css
.theme-ocean.dark {
  --background: oklch(0.15 0.02 230);
  --foreground: oklch(0.9 0.01 220);
  /* ... all tokens for dark mode ... */
}
```

Use `next-themes` or any class-based dark mode toggle. Wire it to `UIProvider.resolveTheme` so charts also adapt.

---

## What's Customizable vs. Not

### Fully customizable (via CSS tokens + UIProvider)

- All component colors (buttons, cards, headers, footers, dialogs, etc.)
- Chart colors (axes, bars, tooltips, emphasis)
- Map point and cluster colors
- Dataset badge colors (palette tokens)
- Body texture effect
- Border radius
- Dark mode

### Customizable with code changes

- **Map tile styles** — Run `scripts/generate-map-style.ts` with different base colors. The script already imports from the shared `defaultColors` palette. Generate new JSON style files per theme.
- **Map style file paths** — Update `lib/constants/map.ts` to point to your generated style files.
- **Font families** — Fonts are loaded in `layout.tsx` via `next/font`. Change the font imports and the `--font-sans`, `--font-serif`, `--font-mono` CSS variables.

### Not customizable (by design)

- **Payload admin panel** — Uses inline styles outside the Tailwind system. Admin components (`admin-notice.tsx`, `geocoding-test-panel.tsx`) have hardcoded colors for Payload compatibility.
- **Global error page** (`global-error.tsx`) — Last-resort crash boundary that can't load external CSS. Uses hardcoded inline styles intentionally.
- **Email templates** — HTML emails don't support CSS variables. Colors are hardcoded in `lib/email/` templates.

---

## Default Theme: Cartographic

The built-in theme uses a warm earth-tone palette inspired by vintage maps:

| Role                   | Color           | OKLCH                  |
| ---------------------- | --------------- | ---------------------- |
| Primary (navy)         | Dark blue-gray  | `oklch(0.35 0.06 250)` |
| Secondary (terracotta) | Warm brown      | `oklch(0.56 0.14 35)`  |
| Accent (forest)        | Muted green     | `oklch(0.42 0.08 145)` |
| Ring (blue)            | Teal-blue       | `oklch(0.58 0.11 220)` |
| Background (parchment) | Warm off-white  | `oklch(0.96 0.01 80)`  |
| Card (cream)           | Light warm gray | `oklch(0.88 0.01 80)`  |
| Foreground (charcoal)  | Near-black      | `oklch(0.25 0 0)`      |

The base palette is defined in `globals.css` as `--cartographic-*` variables. Semantic tokens reference these via `var()`. A new theme can either redefine the `--cartographic-*` values or skip them entirely and set semantic tokens directly.

---

## File Reference

| File                           | Purpose                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| `src/styles/globals.css`       | Full Tailwind setup + base palette + semantic tokens + body styles |
| `src/styles/tokens.css`        | Standalone tokens (no Tailwind) for consumers with their own setup |
| `src/provider.tsx`             | UIProvider for chart themes, map colors, newsletter handler        |
| `src/hooks/use-chart-theme.ts` | `useChartTheme()` and `useMapColors()` hooks                       |
| `src/lib/chart-themes.ts`      | Default chart colors, `MapColors` interface, `defaultMapColors`    |
