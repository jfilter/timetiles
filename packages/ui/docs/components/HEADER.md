# Header Component Documentation

> **Part of the TimeTiles Cartographic Design System**
> See [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md) for complete design guidance

## Overview

These components provide **navigation and branding** for cartographic-themed applications:

- **Header** - Top navigation bar with sticky positioning and cartographic styling
- **HeaderBrand** - Logo/brand section (composable)
- **HeaderNav** - Navigation menu container (composable)
- **HeaderActions** - Action buttons container (composable)
- **HeaderDecorative** - Optional cartographic decorations (grid overlay, coordinates, compass)

**Why intentionally cartographic?** These components form the navigation identity of cartographic/mapping applications. They work together as a cohesive system with the Footer to create a complete page frame.

## Header Component

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

## HeaderBrand Component

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

## HeaderNav Component

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

## HeaderActions Component

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

## HeaderDecorative Component

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
