# Icon Guidelines

> **Part of the TimeTiles Cartographic Design System**
> See [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) for complete design guidance

## Icon Library

TimeTiles uses **[Lucide Icons](https://lucide.dev/)** - a beautiful, consistent icon set with 1,500+ icons.

### Why Lucide?

- **Consistent design language** - All icons share the same visual style
- **Optimized for React** - Tree-shakeable, TypeScript support
- **Accessible** - Proper ARIA attributes built-in
- **Customizable** - Size, stroke width, color via props
- **Open source** - MIT licensed

## Installation

```bash
pnpm add lucide-react
```

Lucide is already installed in both `packages/ui` and `apps/web`.

## Usage

### Basic Usage

```tsx
import { MapPin, Calendar, Download } from "lucide-react";

<MapPin className="h-4 w-4" />
<Calendar className="h-5 w-5 text-muted-foreground" />
<Download className="h-6 w-6 text-primary" />
```

### With Buttons

```tsx
import { Plus, Trash2, Edit } from "lucide-react";

// Icon with text
<Button>
  <Plus className="mr-2 h-4 w-4" />
  Create Dataset
</Button>

// Icon only (provide aria-label)
<Button variant="ghost" size="icon" aria-label="Delete dataset">
  <Trash2 className="h-4 w-4" />
</Button>
```

### In Components

```tsx
import { AlertCircle, CheckCircle, Info } from "lucide-react";

// Alert with icon
<Alert variant="error">
  <AlertCircle className="h-4 w-4" />
  <AlertTitle>Import failed</AlertTitle>
  <AlertDescription>CSV file is missing required columns.</AlertDescription>
</Alert>
```

## Icon Sizing

Use Tailwind size classes for consistency:

| Size | Class | Pixels | Usage |
|------|-------|--------|-------|
| Extra small | `h-3 w-3` | 12px | Inline badges, tight spaces |
| Small | `h-4 w-4` | 16px | Buttons, form labels, list items |
| Default | `h-5 w-5` | 20px | Section headers, cards |
| Medium | `h-6 w-6` | 24px | Page titles, prominent actions |
| Large | `h-8 w-8` | 32px | Empty states, hero sections |
| Extra large | `h-12 w-12` | 48px | Large empty states, splash screens |

**Most common:** `h-4 w-4` (small) and `h-5 w-5` (default)

## Color Guidelines

### Semantic Colors

Use semantic color classes for meaning:

```tsx
// Default (inherits text color)
<MapPin className="h-5 w-5" />

// Muted (secondary information)
<Calendar className="h-4 w-4 text-muted-foreground" />

// Primary (interactive elements)
<Download className="h-5 w-5 text-primary" />

// Destructive (dangerous actions)
<Trash2 className="h-4 w-4 text-destructive" />

// Success
<CheckCircle className="h-5 w-5 text-cartographic-forest" />

// Warning
<AlertTriangle className="h-5 w-5 text-amber-600" />
```

### Cartographic Colors

For branded sections (Hero, Header, Footer):

```tsx
<MapPin className="h-6 w-6 text-cartographic-blue" />
<Compass className="h-5 w-5 text-cartographic-navy" />
```

## Stroke Width

Lucide icons default to 2px stroke. Adjust for different contexts:

```tsx
// Default stroke (2px) - most common
<Icon className="h-5 w-5" />

// Thin stroke (1px) - delicate, small icons
<Icon className="h-4 w-4" strokeWidth={1} />

// Thick stroke (2.5px) - emphasis, large icons
<Icon className="h-8 w-8" strokeWidth={2.5} />
```

**Recommendation:** Stick with default stroke width (2px) for consistency.

## Common Icons by Context

### Navigation

```tsx
import {
  Home,
  Map,
  Layers,
  Settings,
  HelpCircle,
  User,
} from "lucide-react";
```

### Actions

```tsx
import {
  Plus,           // Create
  Edit,           // Edit
  Trash2,         // Delete
  Copy,           // Duplicate
  Download,       // Export
  Upload,         // Import
  Save,           // Save
  X,              // Close/Cancel
  Check,          // Confirm
  RefreshCw,      // Refresh
} from "lucide-react";
```

### Data & Files

```tsx
import {
  FileText,       // File
  Folder,         // Folder/Catalog
  Database,       // Dataset
  Table,          // Table/Grid
  List,           // List view
  BarChart3,      // Charts
} from "lucide-react";
```

### Geospatial

```tsx
import {
  MapPin,         // Location marker
  Map,            // Map view
  Globe,          // Global/World
  Compass,        // Direction/Navigation
  Navigation,     // GPS/Navigation
  Layers,         // Map layers
} from "lucide-react";
```

### Status & Feedback

```tsx
import {
  CheckCircle,    // Success
  XCircle,        // Error
  AlertCircle,    // Warning
  Info,           // Information
  AlertTriangle,  // Caution
  Loader2,        // Loading (animated)
} from "lucide-react";
```

### Time & Calendar

```tsx
import {
  Calendar,       // Date picker
  Clock,          // Time
  CalendarDays,   // Date range
  Timer,          // Duration
} from "lucide-react";
```

### UI Elements

```tsx
import {
  ChevronDown,    // Dropdown
  ChevronRight,   // Expand
  ChevronLeft,    // Back
  ChevronsUpDown, // Sort
  Search,         // Search
  Filter,         // Filters
  SlidersHorizontal, // Settings/Adjust
  Eye,            // Visibility
  EyeOff,         // Hidden
  MoreHorizontal, // More menu (...)
  Menu,           // Hamburger menu
} from "lucide-react";
```

## Animated Icons

For loading states, use `Loader2` with animation:

```tsx
import { Loader2 } from "lucide-react";

<Loader2 className="h-4 w-4 animate-spin" />

// In button
<Button disabled>
  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  Importing...
</Button>
```

## Accessibility

### Icon-Only Buttons

Always provide `aria-label` for icon-only buttons:

```tsx
// ✅ Good - has aria-label
<Button variant="ghost" size="icon" aria-label="Delete dataset">
  <Trash2 className="h-4 w-4" />
</Button>

// ❌ Bad - no label for screen readers
<Button variant="ghost" size="icon">
  <Trash2 className="h-4 w-4" />
</Button>
```

### Decorative Icons

Icons paired with text are decorative and should be hidden from screen readers:

```tsx
<Button>
  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
  Create Dataset
</Button>
```

**Note:** Lucide React automatically adds `aria-hidden="true"` when used in this context.

### Meaningful Icons

Icons conveying information need accessible alternatives:

```tsx
// Status with icon + text
<div className="flex items-center gap-2">
  <CheckCircle className="h-4 w-4 text-green-600" />
  <span>Import complete</span>
</div>

// Status with icon only (needs aria-label)
<div aria-label="Import complete">
  <CheckCircle className="h-5 w-5 text-green-600" />
</div>
```

## Custom Icons

If you need a custom icon not in Lucide:

### Option 1: Request Addition to Lucide

[Submit an icon request](https://github.com/lucide-icons/lucide/issues) to the Lucide team.

### Option 2: Create Custom Icon Component

```tsx
// Custom icon following Lucide patterns
export const CustomIcon = ({ className, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn("lucide lucide-custom", className)}
    {...props}
  >
    {/* SVG path here */}
  </svg>
);
```

**Guidelines for custom icons:**
- Use 24x24 viewBox
- 2px stroke width (default)
- `stroke="currentColor"` (inherits text color)
- Round line caps and joins
- Keep visual weight consistent with Lucide

### Option 3: Use SVG Directly

For one-off icons:

```tsx
<svg
  className="h-5 w-5"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  strokeWidth="2"
>
  {/* SVG path */}
</svg>
```

## Icon Consistency Checklist

When using icons:

- [ ] Used appropriate size (`h-4 w-4` or `h-5 w-5` most common)
- [ ] Applied semantic color classes when needed
- [ ] Provided `aria-label` for icon-only buttons
- [ ] Used consistent icons for same actions (don't mix `Plus` and `PlusCircle`)
- [ ] Aligned icons with text baseline
- [ ] Added proper spacing (`mr-2` or `gap-2`)

## Finding Icons

**Browse all icons:** [https://lucide.dev/icons](https://lucide.dev/icons)

**Search by keyword:**
- "map" → MapPin, Map, Globe, Compass
- "file" → FileText, File, Folder, Files
- "edit" → Edit, Edit2, Edit3, Pencil
- "delete" → Trash, Trash2, X, XCircle

**Tip:** Use Lucide's search - it has great keyword matching.

## Examples

### Card with Icon Header

```tsx
<Card>
  <CardHeader>
    <div className="flex items-center gap-2">
      <Database className="h-5 w-5 text-primary" />
      <CardTitle>Climate Events Dataset</CardTitle>
    </div>
  </CardHeader>
  <CardContent>
    <p className="text-sm text-muted-foreground">
      1,234 events across 50 locations
    </p>
  </CardContent>
</Card>
```

### Empty State with Large Icon

```tsx
<div className="flex flex-col items-center justify-center py-12">
  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
  <h3 className="text-lg font-semibold">No datasets yet</h3>
  <p className="text-sm text-muted-foreground mb-4">
    Import your first dataset to get started
  </p>
  <Button>
    <Plus className="mr-2 h-4 w-4" />
    Import Dataset
  </Button>
</div>
```

### Status Indicators

```tsx
<div className="space-y-2">
  <div className="flex items-center gap-2">
    <CheckCircle className="h-4 w-4 text-green-600" />
    <span className="text-sm">Geocoding complete</span>
  </div>
  <div className="flex items-center gap-2">
    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
    <span className="text-sm">Processing events...</span>
  </div>
  <div className="flex items-center gap-2">
    <XCircle className="h-4 w-4 text-red-600" />
    <span className="text-sm">Import failed</span>
  </div>
</div>
```

---

**Questions about icons?** Browse the [Lucide icon library](https://lucide.dev/icons) or check [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) for design guidance.
