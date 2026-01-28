# Component Library Status

> **Part of the TimeTiles Cartographic Design System**
> See [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) for complete design guidance

## Completed Components

All components use **semantic design tokens** and are fully themable. They work with any theme (cartographic, custom, etc.) without code changes.

### Form Components

- ✅ **Input** - Text input with semantic borders (`border-input`) and focus states (`ring-ring`)
- ✅ **Textarea** - Multi-line text input using semantic colors (`bg-background`, `text-foreground`)
- ✅ **Label** - Form labels with variant support using semantic tokens (default, muted, error)
- ✅ **Select** - Dropdown with semantic styling (`bg-popover`, `text-popover-foreground`)
- ✅ **Button** - Multiple semantic variants (default, secondary, outline, ghost, destructive, link)

### Layout Components

All use semantic tokens for full theme compatibility:

- ✅ **Card** - Content containers using `bg-card`, `text-card-foreground`
- ✅ **Hero** - Landing page heroes with semantic backgrounds (`bg-background`)
- ✅ **Features** - Feature grids with semantic accent colors (`text-primary`, `text-secondary`, `text-accent`)
- ✅ **Stats** - Statistics display using semantic tokens (`bg-primary`, `text-primary-foreground`)
- ✅ **CallToAction** - CTA sections with semantic variants (`bg-background`, `bg-card`, `bg-primary`)
- ✅ **Footer** - Page footers using semantic tokens (`border-border`, `text-muted-foreground`)

### Cartographic Header Components

Intentionally use cartographic tokens for brand identity:

- ✅ **Header** - Top navigation bar with sticky positioning and cartographic styling
- ✅ **HeaderBrand** - Logo/brand section (composable)
- ✅ **HeaderNav** - Navigation menu container (composable)
- ✅ **HeaderActions** - Action buttons container (composable)
- ✅ **HeaderDecorative** - Optional cartographic decorations (grid overlay, coordinates, compass)

See [components/HEADER.md](components/HEADER.md) for detailed Header documentation.

### Data Visualization

All use semantic tokens with themable color schemes:

- ✅ **BaseChart** - Foundation chart component with themable loading states
- ✅ **BarChart** - Bar chart with themable color schemes
- ✅ **TimeHistogram** - Time-based histogram charts with theme support
- ✅ **Chart Themes** - Customizable light/dark themes with semantic color mapping

## Component Variants

All variants use semantic design tokens for full theme compatibility.

### Label Variants

- `default` - Foreground text (`text-foreground`) for standard labels
- `muted` - Muted text (`text-muted-foreground`) for secondary labels
- `error` - Destructive color (`text-destructive`) for error states

### Select Variants

- `default` - Subtle borders (`border-input`)
- `outline` - Strong borders (`border-input`)
- Sizes: `sm`, `default`, `lg`

### Card Variants

- `default` - Card background (`bg-card`) with semantic border (`border-border`)
- `elevated` - Card background with shadow and hover effect
- `outline` - Transparent background with semantic border
- `ghost` - Muted background (`bg-muted/50`), no border

### Button Variants

- `default` - Primary background (`bg-primary`, `text-primary-foreground`)
- `secondary` - Secondary background (`bg-secondary`, `text-secondary-foreground`)
- `outline` - Border with transparent background (`border-input`, `bg-background`, `hover:bg-accent`)
- `ghost` - No border, subtle hover (`hover:bg-accent`, `hover:text-accent-foreground`)
- `destructive` - Destructive background with white text (`bg-destructive`)
- `link` - Text link with underline on hover (`text-primary`)

## Planned Components

Future additions to the component library:

- Alert/Toast notifications with cartographic styling
- Modal/Dialog with refined borders
- Tabs with map-inspired active indicators
- Breadcrumbs with cartographic separators
- Pagination with minimal styling
- Checkbox and Radio with cartographic styling
- Toggle/Switch components
- Progress indicators
