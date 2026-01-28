# Theming Architecture

> **Part of the TimeTiles Cartographic Design System**
> See [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) for complete design guidance

## Multi-Theme Support

The design system supports multiple themes through **semantic design tokens** that map to underlying color values. This allows components to work with different visual themes without code changes.

## Theme Layers

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

## Making Components Themable

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

## Creating Custom Themes

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

## Theme Switching

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

## Best Practices

1. **Default to semantic tokens**: Use `bg-background`, `text-foreground`, `border-border` for maximum theme compatibility
2. **Offer theme-specific variants**: Provide `cartographic` variant for components that benefit from the earth-tone aesthetic
3. **Document theme assumptions**: If a component only works with certain themes, document this clearly
4. **Test in both light and dark**: Always verify components work in both modes
5. **Avoid opacity tricks**: Use explicit dark mode colors instead of light mode colors with opacity

## Available Semantic Tokens

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
