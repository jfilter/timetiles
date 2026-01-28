# TimeTiles Cartographic Design System

## Philosophy

The TimeTiles design system embodies **refined cartographic elegance** — a visual language inspired by traditional cartography, editorial publishing, and geographic information systems. This design language prioritizes:

- **Clarity and Precision**: Like a well-crafted map, every element serves a clear purpose
- **Editorial Typography**: Sophisticated serif and sans-serif pairings that convey authority and trustworthiness
- **Earth-Tone Palette**: Colors drawn from natural geography — parchment, navy, terracotta, forest
- **Minimal, Performance-Focused Interactions**: Subtle animations and transitions that enhance usability without sacrificing speed
- **Timeless Aesthetics**: Design that ages gracefully, avoiding trendy patterns that quickly become dated

## Quick Decision Guide

> **TL;DR for common design decisions. See sections below for detailed guidance.**

### Decision: Which Color Tokens?

**Never hardcode colors** - No `bg-[#f8f5f0]`, `text-[#4a5568]`, or arbitrary values. Always use design tokens.

```
Building a component?
  ├─ Form component (Input, Button, Select)? → Use semantic tokens (bg-background, border-input)
  ├─ Layout/branding (Hero, Header, Footer)? → Check component-specific guidance below
  └─ Data visualization (charts, maps)? → Use cartographic palette from chart-themes.ts
```

### Decision: Where Does This Component Go?

| Question | YES → packages/ui | NO → apps/web |
|----------|-------------------|---------------|
| Is it purely presentational? | ✅ | ❌ |
| Reusable across apps? | ✅ | ❌ |
| No business logic? | ✅ | ❌ |
| Generic name (Button, Card, Input)? | ✅ | ❌ |
| Domain-specific (Dataset, Event)? | ❌ | ✅ |
| Uses TimeTiles data/APIs? | ❌ | ✅ |

**Rule of thumb:** If the component name mentions TimeTiles concepts (Dataset, Event, Catalog), it stays in apps/web.

### Decision: Which Font?

```
What am I styling?
  ├─ Display heading (Hero, h1, h2)? → font-serif (Playfair Display)
  ├─ Body text, UI labels, forms? → font-sans (DM Sans)
  └─ Numbers, code, statistics? → font-mono (Space Mono)
```

### Common Mistakes & Fixes

| Mistake | Why It's Wrong | Fix |
|---------|----------------|-----|
| `bg-[#f8f5f0]` | Hardcoded colors break theming | Use `bg-cartographic-parchment` or `bg-background` |
| `bg-cartographic-blue` in Button | Breaks multi-theme support | Use `bg-primary` (semantic token) |
| DatasetCard in packages/ui | Domain-specific, not reusable | Move to apps/web/components |
| `font-sans` for hero headline | Wrong hierarchy | Use `font-serif` for display typography |
| Creating new generic component | May already exist | Check [COMPONENT_STATUS.md](COMPONENT_STATUS.md) first |

### Quick Reference Links

| Topic | Location |
|-------|----------|
| Component patterns (shadcn/ui) | Line 291 (below) |
| Semantic vs cartographic tokens | Line 132 (below) |
| Making components themable | [THEMING.md](THEMING.md) |
| Component status & variants | [COMPONENT_STATUS.md](COMPONENT_STATUS.md) |
| Header component details | [components/HEADER.md](components/HEADER.md) |

---

## Color System

### Palette

All colors are defined in OKLCH color space for perceptual uniformity and better dark mode support.

#### Primary Colors

**Parchment** `oklch(0.96 0.01 80)` — `--cartographic-parchment`

- **Usage**: Primary background color, neutral base for light mode
- **Semantic**: Canvas, foundation, breathing room
- **Pairs with**: All colors, especially charcoal and navy text

**Charcoal** `oklch(0.25 0 0)` — `--cartographic-charcoal`

- **Usage**: Primary text color, headings, important UI elements
- **Semantic**: Authority, permanence, legibility
- **Pairs with**: Parchment, cream backgrounds

**Navy** `oklch(0.35 0.06 250)` — `--cartographic-navy`

- **Usage**: Secondary text, borders, navigation elements
- **Semantic**: Depth, water bodies on maps, professional tone
- **Pairs with**: Parchment, cream, blue accents

#### Accent Colors

**Blue** `oklch(0.58 0.11 220)` — `--cartographic-blue`

- **Usage**: Interactive elements, links, hover states, focus rings
- **Semantic**: Action, exploration, water
- **Accessibility**: WCAG AA compliant on parchment (4.5:1 contrast)
- **Pairs with**: Navy, parchment

**Terracotta** `oklch(0.56 0.14 35)` — `--cartographic-terracotta`

- **Usage**: Warm accents, feature highlights, icons
- **Semantic**: Land, earth, warmth
- **Pairs with**: Forest, parchment, navy

**Forest** `oklch(0.42 0.08 145)` — `--cartographic-forest`

- **Usage**: Success states, vegetation-related features, secondary accents
- **Semantic**: Growth, nature, forests on maps
- **Pairs with**: Terracotta, parchment

**Cream** `oklch(0.88 0.01 80)` — `--cartographic-cream`

- **Usage**: Secondary background, card backgrounds, subtle elevation
- **Semantic**: Softness, paper texture, aged documents
- **Pairs with**: Charcoal text, navy borders

### Usage Guidelines

#### Backgrounds

- **Primary backgrounds**: Parchment
- **Elevated surfaces**: Cream (cards, modals, dropdowns)
- **Inverted sections**: Navy (stat bars, hero sections with reversed text)

#### Text

- **Primary text**: Charcoal on parchment/cream
- **Secondary text**: Navy at 60-70% opacity
- **Interactive text**: Blue for links and actions

#### Borders

- **Subtle borders**: Navy at 20-30% opacity
- **Emphasized borders**: Navy at full opacity
- **Accent borders**: Blue for focus states

#### States

- **Hover**: Reduce opacity by 10%, or shift to blue
- **Focus**: Blue ring at 50% opacity, 2px offset
- **Active**: Slightly darken background
- **Disabled**: 50% opacity

### Dark Mode Strategy

The cartographic design system uses the **same color variables** in both light and dark modes. This works because:

1. **OKLCH perceptual uniformity**: Colors maintain consistent perceived brightness
2. **Inverted logo strategy**: Logos use `dark:invert` and `dark:opacity-90`
3. **Selective background changes**: Only specific sections change (e.g., parchment backgrounds remain parchment even in dark mode for consistent brand experience)
4. **Contrast maintenance**: All color combinations maintain WCAG AA contrast in both modes

For components that need true dark mode backgrounds, use:

```css
bg-white dark:bg-cartographic-cream
```

For text that needs adjustment:

```css
text-cartographic-charcoal dark:text-cartographic-charcoal/90
```

## Typography System

### Typefaces

**Playfair Display** — `--font-serif`

- **Usage**: Display headings (h1, h2), hero text, editorial content
- **Characteristics**: High-contrast serif, elegant, authoritative
- **Weights**: 400 (regular), 700 (bold)
- **When to use**: Large headlines, landing pages, marketing content

**DM Sans** — `--font-sans`

- **Usage**: Body text, UI labels, navigation, forms
- **Characteristics**: Geometric sans-serif, highly legible, modern
- **Weights**: Variable (400-700)
- **When to use**: All body text, buttons, input fields, general UI

**Space Mono** — `--font-mono`

- **Usage**: Code snippets, data visualization, statistics
- **Characteristics**: Monospace, technical, precise
- **Weights**: 400 (regular), 700 (bold)
- **When to use**: Numbers, data tables, code examples, technical content

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

## Spacing System

Based on Tailwind's spacing scale, with emphasis on generous whitespace:

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
        cartographic: "cartographic styles",
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

### Cartographic Variants

Every component should offer cartographic-themed variants:

**Button Variants**:

- `default`: Primary background with primary text (semantic tokens)
- `secondary`: Secondary background with secondary text (semantic tokens)
- `outline`: Border with transparent background, hover fills accent (semantic tokens)
- `ghost`: No border, subtle hover state (semantic tokens)

**Card Variants**:

- `default`: White background, subtle navy border
- `elevated`: White with shadow, no border
- `outline`: Transparent with navy border
- `ghost`: Parchment background, no border

### Composition Patterns

Components are designed to be **composable**:

```tsx
// Card with subcomponents
<Card variant="elevated" padding="lg">
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
2. **Focus Indicators**: Blue ring with 2px offset, 50% opacity
3. **ARIA Labels**: Provide meaningful labels for screen readers
4. **Color Contrast**: Minimum WCAG AA (4.5:1 for normal text, 3:1 for large text)
5. **Semantic HTML**: Use proper heading hierarchy, landmark elements

## Border Radius

The cartographic design system uses **minimal border radius** to evoke precision and technical drawings:

```css
rounded-sm   /* 2px - Most UI elements (buttons, inputs, cards) */
rounded-md   /* 4px - Larger containers, modals */
rounded-none /* 0px - Technical elements, data visualizations */
```

**Principle**: Sharp corners convey precision and technical accuracy, aligning with cartographic tradition.

## Shadows

Shadows are subtle and sparse:

```css
shadow-xs    /* Buttons, inputs - minimal elevation */
shadow-sm    /* Cards in default state */
shadow-md    /* Elevated cards, dropdowns */
shadow-lg    /* Modals, prominent overlays */
```

**Principle**: Use shadows sparingly. Prefer borders over shadows for most elevation needs.

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
hover:bg-cartographic-blue       /* Color shift */

/* Cards */
hover:shadow-lg                  /* Elevation increase */

/* Links */
hover:text-cartographic-blue     /* Color change */
hover:underline                  /* Underline appearance */
```

**Principle**: Animations should be **subtle and purposeful**. Avoid gratuitous motion. Prefer opacity and color transitions over transforms.

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

## Component API Design

### Generic, Reusable Props

Components should accept generic, composable props rather than specific content:

```tsx
// ❌ Avoid: Too specific
interface HeroProps {
  headline: string;
  subheadline: string;
}

// ✅ Prefer: Generic and composable
interface HeroProps {
  variant?: "centered" | "split" | "full-bleed";
  children: React.ReactNode;
}

<Hero variant="centered">
  <HeroHeadline>Custom headline</HeroHeadline>
  <HeroSubheadline>Custom subheadline</HeroSubheadline>
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
<Card variant="elevated" padding="lg">Content</Card>
```

## File Organization

```
packages/ui/src/
├── components/          # All shadcn/ui compliant components
│   ├── button.tsx
│   ├── card.tsx
│   ├── input.tsx
│   ├── textarea.tsx
│   ├── label.tsx
│   ├── select.tsx
│   ├── hero.tsx        # Generic hero component
│   ├── features.tsx    # Generic features component
│   ├── stats.tsx       # Generic stats component
│   ├── cta.tsx         # Generic call-to-action component
│   └── footer.tsx      # Generic footer component
├── styles/
│   └── globals.css     # Design tokens, base styles
├── lib/
│   └── utils.ts        # cn() helper, utilities
└── examples/           # Usage examples for documentation
    ├── hero-examples.tsx
    ├── features-examples.tsx
    └── ...
```

## Usage Examples

### Creating a Landing Page

```tsx
import { Hero, Features, Stats, CallToAction, Footer } from "@timetiles/ui/components";
import { Button } from "@timetiles/ui/components/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <Hero variant="centered">
        <HeroHeadline>Explore Your Geodata</HeroHeadline>
        <HeroSubheadline>Visualize and analyze spatial data like never before</HeroSubheadline>
      </Hero>

      <Features variant="grid" columns={3}>
        <Feature icon="🗺️" accent="blue">
          <FeatureTitle>Interactive Maps</FeatureTitle>
          <FeatureDescription>Beautiful, responsive maps for your data</FeatureDescription>
        </Feature>
        {/* More features... */}
      </Features>

      <Stats variant="bar">
        <Stat value="1M+" label="Events Processed" />
        <Stat value="10K+" label="Datasets Analyzed" />
      </Stats>

      <CallToAction variant="centered">
        <CallToActionHeadline>Ready to explore?</CallToActionHeadline>
        <Button size="lg">Get Started</Button>
      </CallToAction>

      <Footer />
    </div>
  );
}
```

### Form with Cartographic Components

```tsx
import { Card, CardContent } from "@timetiles/ui/components/card";
import { Input } from "@timetiles/ui/components/input";
import { Textarea } from "@timetiles/ui/components/textarea";
import { Button } from "@timetiles/ui/components/button";
import { Label } from "@timetiles/ui/components/label";

export function ContactForm() {
  return (
    <Card variant="elevated" padding="lg">
      <CardContent>
        <form className="space-y-6">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="Your name" />
          </div>

          <div>
            <Label htmlFor="message">Message</Label>
            <Textarea id="message" placeholder="Your message" />
          </div>

          <Button type="submit">Send Message</Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

## Design Tokens Reference

### CSS Custom Properties

```css
/* Colors */
--cartographic-parchment: oklch(0.96 0.01 80);
--cartographic-charcoal: oklch(0.25 0 0);
--cartographic-navy: oklch(0.35 0.06 250);
--cartographic-blue: oklch(0.58 0.11 220);
--cartographic-terracotta: oklch(0.56 0.14 35);
--cartographic-forest: oklch(0.42 0.08 145);
--cartographic-cream: oklch(0.88 0.01 80);

/* Typography */
--font-serif: "Playfair Display", serif;
--font-sans: "DM Sans", sans-serif;
--font-mono: "Space Mono", monospace;

/* Spacing (using Tailwind's scale) */
/* See https://tailwindcss.com/docs/customizing-spacing */

/* Border Radius */
--radius-sm: 2px;
--radius-md: 4px;
--radius-none: 0px;
```

### Tailwind Configuration

Add to `tailwind.config.ts`:

```typescript
export default {
  theme: {
    extend: {
      colors: {
        cartographic: {
          parchment: "oklch(0.96 0.01 80)",
          charcoal: "oklch(0.25 0 0)",
          navy: "oklch(0.35 0.06 250)",
          blue: "oklch(0.58 0.11 220)",
          terracotta: "oklch(0.56 0.14 35)",
          forest: "oklch(0.42 0.08 145)",
          cream: "oklch(0.88 0.01 80)",
        },
      },
      fontFamily: {
        serif: ["var(--font-serif)"],
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
    },
  },
};
```

## Component Classification

### Theme-Agnostic Form Components

These components use semantic design tokens (`bg-background`, `text-foreground`, `border-input`, etc.) and work with any theme:

- **Input** - Uses `border-input`, `bg-background`, `text-foreground`
- **Textarea** - Uses `border-input`, `bg-background`, `text-foreground`
- **Label** - Uses `text-foreground` (default), `text-muted-foreground` (muted)
- **Select** - Uses `border-input`, `bg-background`, `bg-popover`, `text-foreground`
- **Card** - Uses `bg-card`, `text-card-foreground`, `border-border`
- **Button** - Uses `bg-primary`, `bg-secondary`, `bg-accent`, `text-primary-foreground`

These components adapt to any theme (cartographic, ocean, sunset, etc.) by changing the semantic token mappings in CSS.

### Intentionally Cartographic Layout Components

These components are **specifically designed for cartographic-themed landing pages** and intentionally use cartographic color tokens:

- **Hero** - Uses cartographic grid backgrounds, parchment/cream colors
- **Features** - Uses cartographic accent colors (blue, terracotta, forest)
- **Stats** - Uses cartographic navy backgrounds and parchment text
- **CallToAction** - Uses cartographic parchment, navy, and cream colors
- **Footer** - Uses cartographic navy borders and parchment backgrounds

**Why intentionally cartographic?** These components form the visual identity of a cartographic-themed landing page. They're meant to be used together as a cohesive design system for geographic/mapping applications. If you need generic landing page components, consider creating theme-agnostic variants or using these as inspiration.

### Data Visualization Components

- **BaseChart** - Loading states use semantic tokens (`bg-muted`, `border-primary`)
- **BarChart**, **TimeHistogram** - Use cartographic color palette for data visualization consistency

## Component Library & Status

**See [COMPONENT_STATUS.md](COMPONENT_STATUS.md) for complete component list, variants, and status.**

**Key components:**
- **Form components** (Input, Button, Select, Label, Textarea) - Use semantic tokens
- **Layout components** (Card, Hero, Features, Stats, CallToAction, Footer) - See component docs
- **Header components** - See [components/HEADER.md](components/HEADER.md) for detailed Header documentation
- **Data visualization** (BaseChart, BarChart, TimeHistogram) - Use cartographic palette

All components use semantic design tokens for full theme compatibility.

## Future Considerations

### Planned Components

- Alert/Toast notifications with cartographic styling
- Modal/Dialog with refined borders
- Tabs with map-inspired active indicators
- Breadcrumbs with cartographic separators
- Pagination with minimal styling
- Checkbox and Radio with cartographic styling
- Toggle/Switch components
- Progress indicators

## Theming Architecture

**See [THEMING.md](THEMING.md) for complete theming documentation.**

**Key concepts:**
- **Three-layer architecture**: Base colors → Semantic tokens → Component usage
- **Making components themable**: Use semantic tokens (`bg-background`, `text-foreground`, `border-border`)
- **Available semantic tokens**: Brand colors (brand-primary, brand-accent), Surface colors (surface-primary, surface-secondary), Text colors (text-primary, text-secondary)
- **Custom themes**: Override semantic tokens or create new base palettes
- **Dark mode**: Automatic support via CSS variables

Always use semantic tokens for maximum theme compatibility. Only use cartographic tokens for intentionally branded components (Hero, Header, Footer).

## Data Visualization

### Chart Theming

All charts use the cartographic color palette for consistency with the design system.

**Color Palette** (exported from `chart-themes.ts`):

```typescript
cartographicColors = {
  parchment: "#f8f5f0", // oklch(0.96 0.01 80)
  charcoal: "#404040", // oklch(0.25 0 0)
  navy: "#4a5568", // oklch(0.35 0.06 250)
  blue: "#6495ed", // oklch(0.58 0.11 220)
  terracotta: "#cd853f", // oklch(0.56 0.14 35)
  forest: "#5f9e6e", // oklch(0.42 0.08 145)
  cream: "#e8e4dd", // oklch(0.88 0.01 80)
};
```

**Default Light Theme**:

- Background: Transparent
- Text: Charcoal
- Axis lines: Navy at 30% opacity
- Split lines: Navy at 10% opacity
- Item color: Blue

**Default Dark Theme**:

- Background: Transparent
- Text: Charcoal
- Axis lines: Charcoal at 40% opacity
- Split lines: Charcoal at 20% opacity
- Item color: Blue

**Loading States**:

- Loading overlay: Parchment at 50% opacity with blue spinner
- Updating badge: White/Cream background with navy border and blue spinner

### Design System Evolution

- **Icon system**: Create or adopt consistent icon set (consider map symbols)
- **Motion library**: Define animation curves and durations for complex interactions
- **Responsive images**: Guidelines for hero images, feature illustrations
- **Print styles**: CSS for print-friendly versions (important for map-based app)

---

**Last Updated**: 2025-11-23
**Version**: 1.0.0
**Maintainers**: TimeTiles Team
