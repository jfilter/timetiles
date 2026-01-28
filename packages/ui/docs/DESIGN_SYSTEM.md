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
| Component patterns (shadcn/ui) | Line 284 (below) |
| Color usage guidelines | Line 125 (below) |
| Content & voice guidelines | [CONTENT_VOICE.md](CONTENT_VOICE.md) |
| Design patterns (forms, errors, loading) | [PATTERNS.md](PATTERNS.md) |
| Icon system | [ICONS.md](ICONS.md) |
| Making components themable | [THEMING.md](THEMING.md) |
| Component status & variants | [COMPONENT_STATUS.md](COMPONENT_STATUS.md) |
| Header component details | [components/HEADER.md](components/HEADER.md) |
| Version history | [CHANGELOG.md](CHANGELOG.md) |

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

## Component Library Status

### Completed Components

All components use **semantic design tokens** and are fully themable. They work with any theme (cartographic, custom, etc.) without code changes.

**Form Components**:

- ✅ **Input** - Text input with semantic borders (`border-input`) and focus states (`ring-ring`)
- ✅ **Textarea** - Multi-line text input using semantic colors (`bg-background`, `text-foreground`)
- ✅ **Label** - Form labels with variant support using semantic tokens (default, muted, error)
- ✅ **Select** - Dropdown with semantic styling (`bg-popover`, `text-popover-foreground`)
- ✅ **Button** - Multiple semantic variants (default, secondary, outline, ghost, destructive, link)

**Layout Components** (semantic tokens):

- ✅ **Card** - Content containers using `bg-card`, `text-card-foreground`
- ✅ **Hero** - Landing page heroes with semantic backgrounds (`bg-background`)
- ✅ **Features** - Feature grids with semantic accent colors (`text-primary`, `text-secondary`, `text-accent`)
- ✅ **Stats** - Statistics display using semantic tokens (`bg-primary`, `text-primary-foreground`)
- ✅ **CallToAction** - CTA sections with semantic variants (`bg-background`, `bg-card`, `bg-primary`)
- ✅ **Footer** - Page footers using semantic tokens (`border-border`, `text-muted-foreground`)

**Data Visualization** (semantic tokens):

- ✅ **BaseChart** - Foundation chart component with themable loading states
- ✅ **BarChart** - Bar chart with themable color schemes
- ✅ **TimeHistogram** - Time-based histogram charts with theme support
- ✅ **Chart Themes** - Customizable light/dark themes with semantic color mapping

### Component Variants Summary

All variants use semantic design tokens for full theme compatibility.

**Label Variants**:

- `default` - Foreground text (`text-foreground`) for standard labels
- `muted` - Muted text (`text-muted-foreground`) for secondary labels
- `error` - Destructive color (`text-destructive`) for error states

**Select Variants**:

- `default` - Subtle borders (`border-input`)
- `outline` - Strong borders (`border-input`)
- Sizes: `sm`, `default`, `lg`

**Card Variants**:

- `default` - Card background (`bg-card`) with semantic border (`border-border`)
- `elevated` - Card background with shadow and hover effect
- `outline` - Transparent background with semantic border
- `ghost` - Muted background (`bg-muted/50`), no border

**Button Variants**:

- `default` - Primary background (`bg-primary`, `text-primary-foreground`)
- `secondary` - Secondary background (`bg-secondary`, `text-secondary-foreground`)
- `outline` - Border with transparent background (`border-input`, `bg-background`, `hover:bg-accent`)
- `ghost` - No border, subtle hover (`hover:bg-accent`, `hover:text-accent-foreground`)
- `destructive` - Destructive background with white text (`bg-destructive`)
- `link` - Text link with underline on hover (`text-primary`)

### Intentionally Cartographic Header Components

These components provide **navigation and branding** for cartographic-themed applications:

- **Header** - Top navigation bar with sticky positioning and cartographic styling
- **HeaderBrand** - Logo/brand section (composable)
- **HeaderNav** - Navigation menu container (composable)
- **HeaderActions** - Action buttons container (composable)
- **HeaderDecorative** - Optional cartographic decorations (grid overlay, coordinates, compass)

**Why intentionally cartographic?** These components form the navigation identity of cartographic/mapping applications. They work together as a cohesive system with the Footer to create a complete page frame.

#### Header Component

**Usage**:

```tsx
import { Header, HeaderBrand, HeaderNav, HeaderActions } from "@timetiles/ui/components/header";

<Header variant="marketing" decorative>
  <HeaderBrand>
    <Logo />
  </HeaderBrand>
  <HeaderNav>
    <HeaderNavItem href="/">Home</HeaderNavItem>
    <HeaderNavItem href="/about">About</HeaderNavItem>
  </HeaderNav>
  <HeaderActions>
    <ThemeToggle />
  </HeaderActions>
</Header>;
```

**Variants**:

- `marketing` - For homepage/marketing pages with full navigation menu
- `app` - For application pages with app-specific actions

**Features**:

- **Sticky positioning**: `sticky top-0` (no top margin/padding waste)
- **Full-width**: Edge-to-edge design (`w-full`)
- **Height**: `h-16` (64px) for consistent vertical rhythm
- **Z-index**: `z-50` to stay above content
- **Backdrop blur**: Subtle depth with `backdrop-blur-sm`

**Color Treatment**:

```css
/* Marketing variant */
bg-cartographic-cream/95 dark:bg-cartographic-charcoal/95
border-b border-cartographic-navy/20

/* App variant */
bg-cartographic-parchment/95 dark:bg-cartographic-charcoal/95
border-b border-cartographic-navy/30
```

**Typography**:

- **Brand/Logo**: `font-serif text-xl` (Playfair Display) - editorial authority
- **Navigation**: `font-sans text-sm tracking-wide` (DM Sans) - clarity
- **Actions**: `font-sans text-xs` (DM Sans) - utility labels

**Spacing**:

```css
/* Container padding */
px-6 md:px-8     /* Horizontal padding */
h-16             /* Fixed height (64px) */

/* Internal gaps */
gap-8            /* Navigation items */
gap-4            /* Action buttons */
```

**Cartographic Decorative Elements** (optional):

When `decorative={true}`:

1. **Grid Overlay Pattern** - Subtle survey map grid:

```css
background-image:
  linear-gradient(to right, oklch(0.35 0.06 250 / 0.05) 1px, transparent 1px),
  linear-gradient(to bottom, oklch(0.35 0.06 250 / 0.05) 1px, transparent 1px);
background-size: 40px 40px;
```

2. **Coordinate Display** - Optional lat/long style numbers:

- Format: `40.7128°N, 74.0060°W`
- Typography: `font-mono text-xs opacity-40`
- Updates on scroll (playful interaction)

3. **Compass Rose** - Micro-interaction icon:

- SVG 8-point compass rose
- Subtle rotation based on scroll: `transform: rotate(${scrollY * 0.1}deg)`
- Size: 16px, opacity 30%

**Mobile Responsiveness**:

```css
/* Mobile (<md): Hamburger menu */
<md: Hide nav items, show hamburger icon, compact actions

/* Tablet (md-lg): Limited nav */
md:  Show key nav items, compact spacing

/* Desktop (lg+): Full nav */
lg:  Full navigation, generous spacing (gap-8)
```

**Hamburger Menu** (mobile):

- Slide from right: `translate-x-full` → `translate-x-0`
- Backdrop: `bg-black/20 backdrop-blur-sm`
- Menu panel: `bg-cartographic-cream` with full nav list
- Animation: 300ms ease-out transition

**Accessibility**:

- Semantic HTML5 `<header>` and `<nav>` elements
- Keyboard navigation support
- ARIA labels for mobile menu toggle
- Focus indicators: Blue ring (`focus:ring-2 focus:ring-cartographic-blue`)

**State Behaviors**:

- **Hover**: Navigation links change to `text-cartographic-blue`
- **Active**: Current page indicator with subtle underline
- **Sticky**: Remains at top on scroll with subtle shadow increase
- **Theme toggle**: Smooth transitions between light/dark modes

#### HeaderBrand Component

**Purpose**: Logo and brand identity section (left side of header)

```tsx
<HeaderBrand>
  <Link href="/">
    <Logo />
    <span>TimeTiles</span>
  </Link>
</HeaderBrand>
```

**Styling**:

- Typography: `font-serif text-xl font-bold`
- Color: `text-cartographic-charcoal dark:text-cartographic-parchment`
- Hover: Subtle scale transform (`hover:scale-105`)
- Transition: `transition-transform duration-200`

#### HeaderNav Component

**Purpose**: Navigation menu container (center of header)

```tsx
<HeaderNav>
  <HeaderNavItem href="/features">Features</HeaderNavItem>
  <HeaderNavItem href="/about">About</HeaderNavItem>
  <HeaderNavItem href="/contact">Contact</HeaderNavItem>
</HeaderNav>
```

**Styling**:

- Layout: `flex items-center gap-8`
- Typography: `font-sans text-sm tracking-wide`
- Link color: `text-cartographic-navy dark:text-cartographic-parchment/80`
- Hover: `hover:text-cartographic-blue`
- Active indicator: Subtle 2px underline in cartographic-blue

**Mobile**: Hidden on `<md`, shown in hamburger menu

#### HeaderActions Component

**Purpose**: Action buttons container (right side of header)

```tsx
<HeaderActions>
  <ThemeToggle />
  <UserMenu />
  <Button>Get Started</Button>
</HeaderActions>
```

**Styling**:

- Layout: `flex items-center gap-4`
- Icon sizing: `h-5 w-5`
- Compact button variants

#### HeaderDecorative Component

**Purpose**: Optional cartographic visual enhancements

```tsx
<HeaderDecorative variant="grid" />
<HeaderDecorative variant="coordinates" position="top-right" />
<HeaderDecorative variant="compass" />
```

**Variants**:

- `grid` - Subtle survey map grid overlay (background pattern)
- `coordinates` - Lat/long style numbers (corner decoration)
- `compass` - Compass rose with scroll interaction

**When to use**:

- Marketing pages: `decorative={true}` for brand experience
- App pages: `decorative={false}` for clean, functional interface

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

### Multi-Theme Support

The design system supports multiple themes through **semantic design tokens** that map to underlying color values. This allows components to work with different visual themes without code changes.

### Theme Layers

**Layer 1: Base Colors** - The actual color values (cartographic palette, original palette, custom palettes)

```css
:root {
  /* Cartographic palette */
  --cartographic-parchment: oklch(0.96 0.01 80);
  --cartographic-charcoal: oklch(0.25 0 0);
  --cartographic-navy: oklch(0.35 0.06 250);
  --cartographic-blue: oklch(0.58 0.11 220);

  /* Original shadcn/ui palette */
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
}
```

**Layer 2: Semantic Tokens** - Purpose-driven tokens that reference base colors

```css
@theme inline {
  /* Semantic tokens can be remapped per theme */
  --color-brand-primary: var(--cartographic-blue);
  --color-brand-accent: var(--cartographic-terracotta);
  --color-brand-success: var(--cartographic-forest);
  --color-surface-primary: var(--background);
  --color-surface-secondary: var(--card);
  --color-text-primary: var(--foreground);
  --color-text-secondary: var(--muted-foreground);
}
```

**Layer 3: Component Usage** - Components reference semantic tokens

```tsx
// ✅ Good: Uses semantic tokens (themable)
<div className="bg-surface-primary text-text-primary">

// ✅ Also good: Uses shadcn/ui tokens (themable)
<div className="bg-background text-foreground">

// ⚠️ Avoid: Direct color references (not themable)
<div className="bg-cartographic-parchment text-cartographic-charcoal">
```

### Making Components Themable

**1. Use Semantic Design Tokens**

Components should reference semantic tokens instead of specific colors:

```tsx
// ❌ Not themable - hardcoded colors
const Button = () => <button className="bg-cartographic-blue text-white">Click me</button>;

// ✅ Themable - uses semantic tokens
const Button = () => <button className="bg-brand-primary text-text-on-brand">Click me</button>;

// ✅ Also themable - uses shadcn/ui tokens
const Button = () => <button className="bg-primary text-primary-foreground">Click me</button>;
```

**2. Provide Semantic Variants**

Offer semantic variants that adapt to any theme:

```tsx
const buttonVariants = cva("base-button-styles", {
  variants: {
    variant: {
      // Semantic variants (adapt to any theme)
      default: "bg-primary text-primary-foreground",
      secondary: "bg-secondary text-secondary-foreground",
      outline: "border border-input bg-background",
      ghost: "hover:bg-accent hover:text-accent-foreground",
      destructive: "bg-destructive text-destructive-foreground",
    },
  },
});
```

**3. Support Dark Mode**

All colors defined with `.dark` variants automatically work:

```css
:root {
  --cartographic-parchment: oklch(0.96 0.01 80); /* Light */
}

.dark {
  --cartographic-parchment: oklch(0.15 0.01 250); /* Dark */
}
```

Components using `bg-cartographic-parchment` automatically adapt when `.dark` class is applied to `<html>` or `<body>`.

### Creating Custom Themes

**Option 1: Override Semantic Tokens**

Create a new theme by remapping semantic tokens to different base colors:

```css
/* app-custom-theme.css */
.theme-ocean {
  /* Remap semantic tokens to ocean colors */
  --color-brand-primary: oklch(0.55 0.15 220); /* Deep ocean blue */
  --color-brand-accent: oklch(0.65 0.18 180); /* Teal */
  --color-brand-success: oklch(0.5 0.12 160); /* Sea green */
}
```

```tsx
<div className="theme-ocean">
  {/* All components use ocean theme */}
  <Button variant="default">Ocean Blue</Button>
</div>
```

**Option 2: Create New Base Palette**

Define a completely new color palette:

```css
.theme-sunset {
  /* New base colors */
  --sunset-orange: oklch(0.65 0.2 40);
  --sunset-pink: oklch(0.7 0.18 10);
  --sunset-purple: oklch(0.45 0.15 300);

  /* Map to semantic tokens */
  --color-brand-primary: var(--sunset-orange);
  --color-brand-accent: var(--sunset-pink);
  --color-brand-success: var(--sunset-purple);
}
```

### Theme Switching

**Static Theme (build-time)**

Set theme via class name:

```tsx
// app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html lang="en" className="theme-cartographic">
      <body>{children}</body>
    </html>
  );
}
```

**Dynamic Theme (runtime)**

Allow users to switch themes:

```tsx
"use client";

export function ThemeSwitcher() {
  const [theme, setTheme] = useState("cartographic");

  useEffect(() => {
    document.documentElement.className = `theme-${theme}`;
  }, [theme]);

  return (
    <select value={theme} onChange={(e) => setTheme(e.target.value)}>
      <option value="cartographic">Cartographic</option>
      <option value="ocean">Ocean</option>
      <option value="sunset">Sunset</option>
    </select>
  );
}
```

### Best Practices

1. **Default to semantic tokens**: Use `bg-background`, `text-foreground`, `border-border` for maximum theme compatibility
2. **Offer theme-specific variants**: Provide `cartographic` variant for components that benefit from the earth-tone aesthetic
3. **Document theme assumptions**: If a component only works with certain themes, document this clearly
4. **Test in both light and dark**: Always verify components work in both modes
5. **Avoid opacity tricks**: Use explicit dark mode colors instead of light mode colors with opacity

### Available Semantic Tokens

**Brand Colors**:

- `brand-primary` - Main brand color (blue)
- `brand-accent` - Secondary brand color (terracotta)
- `brand-success` - Success/positive states (forest)

**Surface Colors**:

- `surface-primary` - Main background (background)
- `surface-secondary` - Card/elevated surfaces (card)
- `surface-muted` - Muted backgrounds (muted)

**Text Colors**:

- `text-primary` - Main text color (foreground)
- `text-secondary` - Muted text (muted-foreground)
- `text-on-brand` - Text on brand color backgrounds (white)

**Standard shadcn/ui tokens** (always available):

- `background`, `foreground`
- `card`, `card-foreground`
- `popover`, `popover-foreground`
- `primary`, `primary-foreground`
- `secondary`, `secondary-foreground`
- `muted`, `muted-foreground`
- `accent`, `accent-foreground`
- `destructive`, `destructive-foreground`
- `border`, `input`, `ring`

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
