# TimeTiles Design System

## Philosophy

The TimeTiles design system provides a **theme-agnostic component library** built on semantic design tokens. Every component adapts automatically to any theme by referencing tokens like `bg-primary` and `text-foreground` instead of hardcoded colors. The design language prioritizes:

- **Clarity and Precision**: Every element serves a clear purpose
- **Editorial Typography**: Sophisticated serif and sans-serif pairings that convey authority and trustworthiness
- **Minimal, Performance-Focused Interactions**: Subtle animations and transitions that enhance usability without sacrificing speed
- **Timeless Aesthetics**: Design that ages gracefully, avoiding trendy patterns that quickly become dated

## Available Themes

TimeTiles ships with two built-in themes. Each theme defines its own color palette, border radius philosophy, shadow strategy, and font selections.

| Theme            | Description                                                                     | Details                                                    |
| ---------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Cartographic** | Earth-tone palette inspired by traditional cartography and editorial publishing | [docs/themes/CARTOGRAPHIC.md](docs/themes/CARTOGRAPHIC.md) |
| **Modern**       | Clean, contemporary palette with rounded corners and vibrant accents            | [docs/themes/MODERN.md](docs/themes/MODERN.md)             |

To create a custom theme, see [docs/THEMING.md](docs/THEMING.md).

---

## Quick Decision Guide

> **TL;DR for common design decisions. See sections below for detailed guidance.**

### Decision: Which Color Tokens?

**Never hardcode colors** -- No `bg-[#f8f5f0]`, `text-[#4a5568]`, or arbitrary values. Always use semantic design tokens.

```
Building a component?
  |-- Form component (Input, Button, Select)? -> Use semantic tokens (bg-background, border-input)
  |-- Layout/branding (Hero, Header, Footer)? -> Check component-specific guidance below
  +-- Data visualization (charts, maps)? -> Use ChartTheme via useChartTheme() hook
```

### Decision: Where Does This Component Go?

| Question                            | YES -> packages/ui | NO -> apps/web |
| ----------------------------------- | ------------------ | -------------- |
| Is it purely presentational?        | Yes                | No             |
| Reusable across apps?               | Yes                | No             |
| No business logic?                  | Yes                | No             |
| Generic name (Button, Card, Input)? | Yes                | No             |
| Domain-specific (Dataset, Event)?   | No                 | Yes            |
| Uses TimeTiles data/APIs?           | No                 | Yes            |

**Rule of thumb:** If the component name mentions TimeTiles concepts (Dataset, Event, Catalog), it stays in apps/web.

### Decision: Which Font?

```
What am I styling?
  |-- Display heading (Hero, h1, h2)? -> font-serif
  |-- Body text, UI labels, forms? -> font-sans
  +-- Numbers, code, statistics? -> font-mono
```

The actual typefaces behind `font-serif`, `font-sans`, and `font-mono` are defined per theme. See [docs/themes/CARTOGRAPHIC.md](docs/themes/CARTOGRAPHIC.md) or [docs/themes/MODERN.md](docs/themes/MODERN.md) for theme-specific font choices.

### Common Mistakes & Fixes

| Mistake                          | Why It's Wrong                 | Fix                                                    |
| -------------------------------- | ------------------------------ | ------------------------------------------------------ |
| `bg-[#f8f5f0]`                   | Hardcoded colors break theming | Use `bg-background` (semantic token)                   |
| `bg-cartographic-*` in component | Breaks multi-theme support     | Use `bg-primary` (semantic token)                      |
| DatasetCard in packages/ui       | Domain-specific, not reusable  | Move to apps/web/components                            |
| `font-sans` for hero headline    | Wrong hierarchy                | Use `font-serif` for display typography                |
| Creating new generic component   | May already exist              | Check [COMPONENT_STATUS.md](COMPONENT_STATUS.md) first |

### Quick Reference Links

| Topic                          | Location                                               |
| ------------------------------ | ------------------------------------------------------ |
| Component patterns (shadcn/ui) | [Component Patterns](#component-patterns) (below)      |
| Making components themable     | [docs/THEMING.md](docs/THEMING.md)                     |
| Component status & variants    | [COMPONENT_STATUS.md](COMPONENT_STATUS.md)             |
| Header component details       | [docs/components/HEADER.md](docs/components/HEADER.md) |

---

## Color Usage Guidelines

All components use **semantic tokens** that resolve to theme-specific values. Never reference palette colors directly in component code.

### Backgrounds

| Purpose              | Token           |
| -------------------- | --------------- |
| Primary background   | `bg-background` |
| Elevated surfaces    | `bg-card`       |
| Muted/de-emphasized  | `bg-muted`      |
| Primary action areas | `bg-primary`    |
| Popovers/dropdowns   | `bg-popover`    |

### Text

| Purpose              | Token                     |
| -------------------- | ------------------------- |
| Primary text         | `text-foreground`         |
| Muted/secondary text | `text-muted-foreground`   |
| On primary surfaces  | `text-primary-foreground` |
| On card surfaces     | `text-card-foreground`    |

### Borders

| Purpose        | Token           |
| -------------- | --------------- |
| Subtle borders | `border-border` |
| Input borders  | `border-input`  |
| Focus rings    | `ring-ring`     |
| Accent borders | `border-accent` |

### States

| State    | Approach                                        |
| -------- | ----------------------------------------------- |
| Hover    | Reduce opacity by 10%, or shift to accent token |
| Focus    | `ring-ring` with 2px offset                     |
| Active   | Slightly darken background                      |
| Disabled | 50% opacity                                     |

See [Cartographic Theme](docs/themes/CARTOGRAPHIC.md) or [Modern Theme](docs/themes/MODERN.md) for theme-specific color palettes and OKLCH values.

---

## Dark Mode Strategy

The design system uses the **same semantic token names** in both light and dark modes. Each theme redefines token values under the `.dark` class. This works because:

1. **OKLCH perceptual uniformity**: Colors maintain consistent perceived brightness across modes
2. **Inverted logo strategy**: Logos use `dark:invert` and `dark:opacity-90`
3. **Contrast maintenance**: All color combinations maintain WCAG AA contrast in both modes
4. **Automatic via UIProvider**: The `resolveTheme` callback on `UIProvider` handles mode switching

For components that need mode-aware backgrounds:

```css
bg-background         /* Resolves differently in light vs dark */
text-foreground       /* Resolves differently in light vs dark */
```

---

## Typography System

### Typefaces

Fonts are referenced through CSS variables. Each theme defines its own typeface selections.

| Variable     | Usage                                                   |
| ------------ | ------------------------------------------------------- |
| `font-serif` | Display headings (h1, h2), hero text, editorial content |
| `font-sans`  | Body text, UI labels, navigation, forms                 |
| `font-mono`  | Code snippets, data visualization, statistics           |

### Type Scale

```css
/* Display (Hero Headlines) */
.text-7xl  /* 72px */ font-serif font-bold
.text-6xl  /* 60px */ font-serif font-bold
.text-5xl  /* 48px */ font-serif font-bold

/* Headings */
.text-4xl  /* 36px */ font-serif font-bold     /* h1 */
.text-3xl  /* 30px */ font-serif font-bold     /* h2 */
.text-2xl  /* 24px */ font-serif font-bold     /* h3 */
.text-xl   /* 20px */ font-serif font-semibold /* h4 */
.text-lg   /* 18px */ font-sans font-semibold  /* h5 */

/* Body */
.text-base /* 16px */ font-sans font-normal    /* Body text */
.text-sm   /* 14px */ font-sans font-normal    /* Secondary text */
.text-xs   /* 12px */ font-sans font-normal    /* Captions, labels */

/* Monospace */
.text-sm   /* 14px */ font-mono font-normal    /* Code, data */
```

### Hierarchy Rules

1. **Use serif for emphasis, sans for readability**
   - Hero headlines, section titles: Serif
   - Body paragraphs, UI text: Sans
   - Technical data, metrics: Mono

2. **Line Heights**
   - Display text: `leading-tight` (1.25)
   - Headings: `leading-snug` (1.375)
   - Body text: `leading-relaxed` (1.625)
   - UI elements: `leading-normal` (1.5)

3. **Font Weights**
   - Headlines: `font-bold` (700)
   - Subheadings: `font-semibold` (600)
   - Body text: `font-normal` (400)
   - De-emphasized text: `font-normal` with opacity

---

## Spacing System

Based on Tailwind's spacing scale, with emphasis on generous whitespace.

### Component Spacing

```css
/* Padding */
px-4  py-3   /* Input fields, small buttons */
px-6  py-4   /* Default buttons, cards */
px-8  py-6   /* Large buttons, prominent cards */

/* Gaps */
gap-2        /* Icon + text in buttons */
gap-4        /* Form fields */
gap-6        /* Card content sections */
gap-12       /* Major layout sections */

/* Margins */
mb-4         /* Paragraph spacing */
mb-8         /* Section spacing */
mb-12        /* Major section breaks */
```

### Layout Spacing

```css
/* Container padding */
px-6         /* Mobile */
px-8         /* Tablet */
px-12        /* Desktop */

/* Section padding */
py-16        /* Standard sections */
py-24        /* Hero, prominent sections */
```

### Principles

1. **Generous whitespace**: Don't be afraid of breathing room
2. **Consistent rhythm**: Use 4px base unit (Tailwind's default)
3. **Optical alignment**: Adjust spacing for visual balance, not just mathematical equality

---

## Component Patterns

### shadcn/ui Compliance

All components follow shadcn/ui patterns:

```typescript
// 1. Use forwardRef for proper ref handling
const Component = React.forwardRef<HTMLElement, ComponentProps>(
  ({ className, ...props }, ref) => {
    return <element ref={ref} className={cn(baseStyles, className)} {...props} />
  }
)
Component.displayName = "Component"

// 2. Use cva (class-variance-authority) for variants
const componentVariants = cva(
  "base classes here",
  {
    variants: {
      variant: {
        default: "default styles",
        secondary: "secondary styles",
      },
      size: {
        default: "default size",
        lg: "large size",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// 3. Export both component and variants
export { Component, componentVariants }
```

### Composition Patterns

Components are designed to be **composable**:

```tsx
// Card with subcomponents
<Card padding="lg">
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>Content here</CardContent>
  <CardFooter>Footer actions</CardFooter>
</Card>
```

### Accessibility Requirements

1. **Keyboard Navigation**: All interactive elements must be keyboard accessible
2. **Focus Indicators**: Ring with 2px offset using `ring-ring` token
3. **ARIA Labels**: Provide meaningful labels for screen readers
4. **Color Contrast**: Minimum WCAG AA (4.5:1 for normal text, 3:1 for large text)
5. **Semantic HTML**: Use proper heading hierarchy, landmark elements

---

## Animation & Transitions

### Transition Duration

```css
transition-colors duration-200   /* Color changes (hover, focus) */
transition-all duration-200      /* Multiple properties */
transition-transform duration-300 /* Transforms (scale, translate) */
```

### Hover Effects

```css
/* Buttons */
hover:bg-ring       /* Color shift */

/* Cards */
hover:shadow-lg                  /* Elevation increase */

/* Links */
hover:text-ring     /* Color change */
hover:underline                  /* Underline appearance */
```

**Principle**: Animations should be **subtle and purposeful**. Avoid gratuitous motion. Prefer opacity and color transitions over transforms.

---

## Grid & Layout

### Container Widths

```css
max-w-4xl   /* Prose content (blogs, articles) */
max-w-5xl   /* Standard sections */
max-w-6xl   /* Wide sections (footer) */
max-w-7xl   /* Full-width hero sections */
```

### Grid Patterns

```css
/* Feature grids */
grid grid-cols-1 md:grid-cols-3 gap-12

/* Stat bars */
grid grid-cols-1 md:grid-cols-3 gap-8

/* Footer */
grid grid-cols-1 md:grid-cols-4 gap-12
```

**Principle**: Use generous gaps (gap-8, gap-12) to create breathing room. Single column on mobile, multi-column on tablet+.

---

## Component API Design

### Generic, Reusable Props

Components should accept generic, composable props rather than specific content:

```tsx
// Avoid: Too specific
interface HeroProps {
  headline: string;
  subheadline: string;
}

// Prefer: Generic and composable
interface HeroProps {
  variant?: "centered" | "split" | "full-bleed";
  children: React.ReactNode;
}

<Hero variant="centered">
  <HeroHeadline>Custom headline</HeroHeadline>
  <HeroSubheadline>Custom subheadline</HeroSubheadline>
  <HeroDescription>Optional supporting copy.</HeroDescription>
  <HeroActions>
    <Button>Get Started</Button>
  </HeroActions>
</Hero>;
```

### Required vs Optional Props

- **Required**: Only props that are truly essential for component function
- **Optional**: Everything else, with sensible defaults

```tsx
// Button: Only children required
<Button>Click me</Button>
<Button variant="secondary" size="lg">Click me</Button>

// Card: Nothing required
<Card />
<Card padding="lg">Content</Card>
```

---

## Component Classification

### Theme-Agnostic Form Components

These components use semantic design tokens and work with any theme:

- **Input** -- `border-input`, `bg-background`, `text-foreground`
- **Textarea** -- `border-input`, `bg-background`, `text-foreground`
- **Label** -- `text-foreground` (default), `text-muted-foreground` (muted)
- **Select** -- `border-input`, `bg-background`, `bg-popover`, `text-foreground`
- **Card** -- `bg-card`, `text-card-foreground`, `border-border`
- **Button** -- `bg-primary`, `bg-secondary`, `bg-accent`, `text-primary-foreground`

### Theme-Agnostic Layout Components

- **Hero** -- `text-foreground`, grid backgrounds via `var(--color-foreground)`
- **Header** -- `bg-card`, `bg-background`, `border-primary`
- **Footer** -- `text-foreground`, `text-primary`, `border-border`
- **Features** -- `text-accent`, `border-accent`, `bg-card`
- **CallToAction** -- `bg-primary`, `bg-card`, `text-foreground`
- **Newsletter** -- `bg-primary`, `text-accent`, `border-border`

### Data Visualization Components

- **BaseChart** -- Loading states use `bg-muted`, `border-ring`
- **BarChart**, **TimeHistogram** -- Use `ChartTheme` from UIProvider (overridable via `lightChartTheme`/`darkChartTheme`)
- **Map clusters** -- Use `MapColors` from UIProvider (overridable via `mapColors`)

---

## Theming Architecture

**See [docs/THEMING.md](docs/THEMING.md) for the complete customization guide.**

Key concepts:

- **Three-layer architecture**: Base palette (OKLCH) -> Semantic tokens (`--primary`, `--background`) -> Tailwind utilities (`bg-primary`, `text-foreground`)
- **All components use semantic tokens**: `bg-background`, `text-foreground`, `border-border`, `bg-primary`, `text-accent`, etc.
- **UIProvider** configures chart themes, map colors, and newsletter handler
- **Custom themes**: Redefine semantic CSS variables -- all components adapt automatically
- **Dark mode**: Automatic via `.dark` class and `UIProvider.resolveTheme`

---

## Data Visualization

### Chart Theming

Charts use the `ChartTheme` interface, configurable via UIProvider's `lightChartTheme`/`darkChartTheme`. Default colors come from `defaultColors` in `chart-themes.ts`.

Map visualizations use the `MapColors` interface, configurable via UIProvider's `mapColors`.

**Loading States**:

- Loading overlay: uses `bg-muted` with `border-ring` spinner
- Updating badge: `bg-background` with `border-ring` spinner

---

**Last Updated**: 2026-03-24
**Version**: 2.0.0
**Maintainers**: TimeTiles Team
