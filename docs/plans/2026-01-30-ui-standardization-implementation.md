# UI Standardization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Standardize error states, loading patterns, and component consistency across the app.

**Architecture:** Create a shared `ContentState` component in `packages/ui` for error/empty states, refactor existing components to use it, standardize loading to skeletons (content) and spinners (actions), and replace raw HTML with shadcn components in import pages.

**Tech Stack:** React 19, shadcn/ui, Tailwind CSS, lucide-react, ECharts

---

### Task 1: Create `ContentState` shared component

**Files:**
- Create: `packages/ui/src/components/content-state.tsx`
- Modify: `packages/ui/src/index.ts`

**Step 1: Create the ContentState component**

Create `packages/ui/src/components/content-state.tsx`:

```tsx
/**
 * General-purpose content state component for empty, no-match, and error states.
 *
 * @module
 * @category Components
 */
"use client";

import { AlertTriangle, Filter, Inbox } from "lucide-react";
import { useMemo } from "react";

import { cn } from "../lib/utils";

export interface ContentStateProps {
  /** Type of state to display */
  variant: "empty" | "no-match" | "error";
  /** Height of the container */
  height?: number | string;
  /** Additional CSS classes */
  className?: string;
  /** Override the default icon for the variant */
  icon?: React.ReactNode;
  /** Custom title to display */
  title?: string;
  /** Custom subtitle below the title */
  subtitle?: string;
  /** Callback for retry button (shown for error variant when provided) */
  onRetry?: () => void;
}

const defaultMessages: Record<ContentStateProps["variant"], { title: string; subtitle: string }> = {
  empty: {
    title: "No data yet",
    subtitle: "There's nothing to show",
  },
  "no-match": {
    title: "No matching results",
    subtitle: "Try adjusting your filters",
  },
  error: {
    title: "Something went wrong",
    subtitle: "There was a problem loading this content",
  },
};

const DefaultIcon = ({ variant }: { variant: ContentStateProps["variant"] }) => {
  switch (variant) {
    case "empty":
      return <Inbox className="h-12 w-12" />;
    case "no-match":
      return <Filter className="h-12 w-12" />;
    case "error":
      return <AlertTriangle className="h-12 w-12" />;
  }
};

export const ContentState = ({
  variant,
  height,
  className,
  icon,
  title,
  subtitle,
  onRetry,
}: ContentStateProps) => {
  const containerStyle = useMemo(() => {
    if (height == null) return undefined;
    const h = typeof height === "number" ? `${height}px` : height;
    return { height: h };
  }, [height]);

  const defaults = defaultMessages[variant];

  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-3", className)}
      style={containerStyle}
    >
      <div className={cn("text-muted-foreground/50", variant === "error" && "text-destructive/50")}>
        {icon ?? <DefaultIcon variant={variant} />}
      </div>
      <div className="text-center">
        <p className="text-foreground text-sm font-medium">{title ?? defaults.title}</p>
        <p className="text-muted-foreground mt-1 text-xs">{subtitle ?? defaults.subtitle}</p>
      </div>
      {variant === "error" && onRetry != null && (
        <button
          type="button"
          onClick={onRetry}
          className="bg-primary text-primary-foreground hover:bg-primary/90 mt-2 rounded-sm px-4 py-1.5 text-xs font-medium transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  );
};
```

**Step 2: Export from packages/ui index**

Add to `packages/ui/src/index.ts`:

```typescript
export type { ContentStateProps } from "./components/content-state";
export { ContentState } from "./components/content-state";
```

**Step 3: Build and verify**

Run: `make check-ai PACKAGE=ui`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/ui/src/components/content-state.tsx packages/ui/src/index.ts
git commit -m "feat(ui): add shared ContentState component for empty/error/no-match states"
```

---

### Task 2: Add shadcn Table and Checkbox to packages/ui

**Files:**
- Create: `packages/ui/src/components/table.tsx`
- Create: `packages/ui/src/components/checkbox.tsx`
- Modify: `packages/ui/src/index.ts`

**Step 1: Add the Table component**

Use `pnpx shadcn@latest add table` from packages/ui, or create manually following the shadcn pattern. The Table component exports: `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableHead`, `TableRow`, `TableCell`, `TableCaption`.

Create `packages/ui/src/components/table.tsx` following the standard shadcn table implementation using `forwardRef`, `cn()`, and appropriate Tailwind classes.

**Step 2: Add the Checkbox component**

Use `pnpx shadcn@latest add checkbox` from packages/ui, or create manually. Requires `@radix-ui/react-checkbox` as a dependency. Install if needed:

```bash
cd packages/ui && pnpm add @radix-ui/react-checkbox
```

Create `packages/ui/src/components/checkbox.tsx` following the standard shadcn checkbox implementation.

**Step 3: Export from packages/ui index**

Add to `packages/ui/src/index.ts`:

```typescript
export { Checkbox } from "./components/checkbox";
export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "./components/table";
```

**Step 4: Build and verify**

Run: `make check-ai PACKAGE=ui`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/ui/src/components/table.tsx packages/ui/src/components/checkbox.tsx packages/ui/src/index.ts
git commit -m "feat(ui): add shadcn Table and Checkbox components"
```

---

### Task 3: Refactor ChartEmptyState to wrap ContentState

**Files:**
- Modify: `packages/ui/src/components/charts/chart-empty-state.tsx`

The existing `ChartEmptyState` API stays the same. Internally, it delegates to `ContentState` with chart-specific defaults.

**Step 1: Refactor chart-empty-state.tsx**

Key changes to `packages/ui/src/components/charts/chart-empty-state.tsx`:
- Import `ContentState` from `../content-state`
- Keep the custom `EmptyChartIcon` SVG
- Replace the render body with `<ContentState>` passing chart-specific icon/messages
- Map `ChartEmptyState` variants to `ContentState` variants: `"no-data" -> "empty"`, `"no-match" -> "no-match"`, `"error" -> "error"`
- Pass the `EmptyChartIcon` as `icon` for `"no-data"`, `Filter` icon for `"no-match"` (inherits from ContentState default), `AlertTriangle` for `"error"` (inherits)
- Pass chart-specific default messages as `title`/`subtitle` overrides
- Keep the `height` prop (default 200) — pass through to ContentState

The existing `ChartEmptyStateProps` interface stays unchanged.

**Step 2: Build and verify**

Run: `make check-ai PACKAGE=ui`
Expected: PASS

**Step 3: Verify existing chart tests still pass**

Run: `make test-ai FILTER=chart`
Expected: All existing chart tests pass

**Step 4: Commit**

```bash
git add packages/ui/src/components/charts/chart-empty-state.tsx
git commit -m "refactor(ui): ChartEmptyState now wraps shared ContentState"
```

---

### Task 4: Add error states to EventsList, charts, and ClusteredMap

**Files:**
- Modify: `apps/web/app/(frontend)/explore/_components/events-list.tsx`
- Modify: `apps/web/components/charts/event-histogram.tsx`
- Modify: `apps/web/components/charts/aggregation-bar-chart.tsx`
- Modify: `apps/web/components/maps/clustered-map.tsx`
- Modify: `apps/web/app/(frontend)/explore/_components/events-list-paginated.tsx` (passes error to EventsList)

**Step 1: Add error prop to EventsList**

In `events-list.tsx`:
- Add to `EventsListProps`: `error?: Error | null;` and `onRetry?: () => void;`
- Import `ContentState` from `@timetiles/ui`
- After the `isInitialLoad` check, add an error check:

```tsx
if (error) {
  return (
    <ContentState
      variant="error"
      title="Failed to load events"
      subtitle={error.message ?? "Something went wrong"}
      onRetry={onRetry}
      height={256}
    />
  );
}
```

**Step 2: Pass error from EventsListPaginated to EventsList**

In `events-list-paginated.tsx`:
- Replace the inline error state (lines 74-80) with `ContentState`:

```tsx
if (isError) {
  return (
    <ContentState
      variant="error"
      title="Failed to load events"
      subtitle={error?.message ?? "Something went wrong"}
      height={256}
    />
  );
}
```

- Import `ContentState` from `@timetiles/ui`

**Step 3: Add error handling to EventHistogram**

In `event-histogram.tsx`:
- Get `isError` and `error` from `useChartQuery`:

```tsx
const { data: histogramData, isInitialLoad, isUpdating, isError, error } = useChartQuery(histogramQuery);
```

- Pass error props to `TimeHistogram`. Since `TimeHistogram` uses `ChartEmptyState` internally for empty states, we need to add error support. The cleanest way: add `isError` and `errorMessage` props to `TimeHistogram`, and when `isError` is true, render `ChartEmptyState variant="error"`.

**Step 4: Add error support to TimeHistogram (packages/ui)**

In `packages/ui/src/components/charts/time-histogram.tsx`:
- Add to `TimeHistogramProps`: `isError?: boolean;`
- Before the empty data check, add:

```tsx
if (isError && !isInitialLoad) {
  return <ChartEmptyState variant="error" height={height} className={className} onRetry={onRetry} />;
}
```

- Also add `onRetry?: () => void;` and `isError?: boolean;` to `TimeHistogramProps`.

**Step 5: Add error support to BarChart (packages/ui)**

In `packages/ui/src/components/charts/bar-chart.tsx`:
- Add to `BarChartProps`: `isError?: boolean;` and `onRetry?: () => void;`
- Before the empty state check (line 148), add:

```tsx
if (isError && !isInitialLoad) {
  return <ChartEmptyState variant="error" height={height} className={className} onRetry={onRetry} />;
}
```

**Step 6: Pass error from AggregationBarChart**

In `aggregation-bar-chart.tsx`:
- Get `isError` from `useChartQuery`:

```tsx
const { data, isInitialLoad, isUpdating, isError } = useChartQuery(aggregationQuery);
```

- Pass `isError` to `BarChart`:

```tsx
<BarChart ... isError={isError} />
```

**Step 7: Add error overlay to ClusteredMap**

In `clustered-map.tsx`:
- Add `isError?: boolean;` to `ClusteredMapProps`
- Import `ContentState` from `@timetiles/ui`
- Add a `MapErrorOverlay` component similar to `MapLoadingOverlay`:

```tsx
const MapErrorOverlay = () => (
  <div className="bg-background/60 pointer-events-auto absolute inset-0 z-20 flex items-center justify-center backdrop-blur-sm">
    <ContentState
      variant="error"
      title="Unable to load map data"
      subtitle="There was a problem loading the map"
    />
  </div>
);
```

- Render it: `{isError && !isLoadingBounds && <MapErrorOverlay />}`

**Step 8: Update chart types exports**

Update `packages/ui/src/components/charts/types.ts` if `BarChartProps` and `TimeHistogramProps` are defined there (they're re-exported from `index.ts`). Make sure the new props are included.

**Step 9: Build and verify**

Run: `make check-ai`
Expected: PASS

**Step 10: Commit**

```bash
git add -A
git commit -m "feat: add error states to EventsList, charts, and ClusteredMap"
```

---

### Task 5: Refactor EventDetailError to use ContentState

**Files:**
- Modify: `apps/web/components/events/event-detail-content.tsx:174-195`

**Step 1: Refactor EventDetailError**

Replace the current implementation with one that uses `ContentState`:

```tsx
import { ContentState } from "@timetiles/ui";

export const EventDetailError = ({ error, onRetry }: { error: Error | null; onRetry?: () => void }) => {
  const isNotFound = error?.message?.includes("not found");
  return (
    <ContentState
      variant="error"
      icon={
        <div className="bg-destructive/10 rounded-full p-4">
          <AlertTriangle className="text-destructive h-8 w-8" />
        </div>
      }
      title={isNotFound ? "Event Not Found" : "Failed to Load Event"}
      subtitle={
        isNotFound
          ? "This event may have been deleted or you don't have permission to view it."
          : "There was a problem loading the event details. Please try again."
      }
      onRetry={isNotFound ? undefined : onRetry}
      className="py-12"
    />
  );
};
```

Note: The `icon` prop wraps AlertTriangle in a styled container to match the existing design (background circle). The `ContentState` retry button replaces the custom `Button` + `RefreshCw` icon.

**Step 2: Build and verify**

Run: `make check-ai PACKAGE=web`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/components/events/event-detail-content.tsx
git commit -m "refactor: EventDetailError uses shared ContentState"
```

---

### Task 6: Standardize loading patterns

**Files:**
- Modify: `apps/web/app/(frontend)/explore/_components/events-list.tsx:205-210`
- Modify: `apps/web/app/(frontend)/explore/_components/events-list-paginated.tsx:105-109`
- Modify: `apps/web/app/(frontend)/import/_components/import-upload.tsx` (emoji spinners)

**Step 1: EventsList — use EventsListSkeleton**

In `events-list.tsx`:
- Import `EventsListSkeleton` from `./events-list-skeleton`
- Replace the `isInitialLoad` block (lines 205-210):

```tsx
if (isInitialLoad) {
  return <EventsListSkeleton count={4} />;
}
```

**Step 2: EventsListPaginated — replace CSS spinner with Loader2**

In `events-list-paginated.tsx`:
- Import `Loader2` from `lucide-react`
- Replace lines 105-109 (the Load More button spinner):

```tsx
{isFetchingNextPage ? (
  <>
    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
    Loading...
  </>
) : (
  "Load More"
)}
```

**Step 3: ImportUpload — replace emoji spinners with Loader2**

In `import-upload.tsx`:
- Import `Loader2` from `lucide-react`
- In `getStatusIcon` (lines 21-32): replace emoji returns with Lucide icon class names or keep as-is (these are status indicators, not spinners). Actually leave `getStatusIcon` alone — the emojis there are status badges (✅, ❌), not loading spinners.
- In `UploadButtons` (lines 160-164): Replace `<span className="animate-spin">⏳</span>` with `<Loader2 className="h-4 w-4 animate-spin" />`
- Replace `📤 Upload & Process` text with just `Upload & Process` (remove emoji)
- Replace raw `<button>` elements in `UploadButtons` with shadcn `Button` component
- Replace raw `<input>` elements in `FileInput` and `CatalogInput` with shadcn `Input` component
- Import `Button`, `Input`, `Label` from `@timetiles/ui`

**Step 4: ImportUpload — replace hardcoded colors**

In the progress bars (lines 230-235, 260-265):
- Replace `bg-gray-200` → `bg-muted`
- Replace `bg-green-600` → `bg-primary`
- Replace `bg-blue-600` → `bg-primary`
- Replace `text-gray-600` → `text-muted-foreground`
- Replace `bg-white` → `bg-card`
- Replace `border-gray-300` → `border-input`
- Replace `bg-gray-100` → `bg-muted`
- Replace `bg-gray-400` → `bg-muted-foreground`
- Replace `bg-blue-600 hover:bg-blue-700` → use shadcn `Button`
- Replace `bg-gray-600 hover:bg-gray-700` → use shadcn `Button variant="secondary"`
- Replace `border-red-200 bg-red-50 text-red-600/800` → `border-destructive/20 bg-destructive/10 text-destructive`
- Replace `border-green-200 bg-green-50 text-green-600/800` → `border-primary/20 bg-primary/10 text-primary`

**Step 5: Build and verify**

Run: `make check-ai`
Expected: PASS

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: standardize loading patterns across EventsList, imports, and pagination"
```

---

### Task 7: Replace raw HTML in import pages

**Files:**
- Modify: `apps/web/app/(frontend)/import/_components/steps/step-field-mapping.tsx`
- Modify: `apps/web/app/(frontend)/import/_components/steps/step-upload.tsx`

**Step 1: StepFieldMapping — replace raw `<select>` with shadcn Select**

In `step-field-mapping.tsx`, the `FieldSelect` component (lines 156-206) uses a raw `<select>`. Replace with shadcn `Select`:

- Import `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` from `@timetiles/ui/components/select`
- Rewrite the `<select>` in `FieldSelect` to use `Select`:

```tsx
<Select value={value ?? ""} onValueChange={(val) => onFieldChange(field, val === "" ? null : val)} disabled={disabled}>
  <SelectTrigger
    id={id}
    className={cn(
      "h-11",
      required && !value && "border-cartographic-terracotta/50",
      isAutoDetected && confidenceLevel === "high" && "border-cartographic-forest/40 border-dashed",
    )}
  >
    <SelectValue placeholder="Select column..." />
  </SelectTrigger>
  <SelectContent>
    {headers.map((header) => (
      <SelectItem key={header} value={header}>
        {header}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

Note: shadcn Select doesn't support empty string as a value well. Use a sentinel value like `"__none__"` for the unselected state, or handle the "clear" action differently. Check existing usage in `StepUpload` (line 395) for the pattern already used in this codebase.

**Step 2: StepFieldMapping — replace `IdStrategyCard` selects**

In `IdStrategyCard` (lines 254-359): Replace all three raw `<select>` elements (id-strategy, dedup-strategy, id-field) with shadcn `Select`.

- `handleStrategyChange` → use `onValueChange` directly
- `handleIdFieldChange` → use `onValueChange` directly
- `handleDeduplicationChange` → use `onValueChange` directly

**Step 3: StepFieldMapping — replace raw checkbox**

In `step-field-mapping.tsx` (lines 597-602): Replace raw `<input type="checkbox">` with shadcn `Checkbox`:

```tsx
import { Checkbox } from "@timetiles/ui";

<Checkbox
  id="geocoding-enabled"
  checked={geocodingEnabled}
  onCheckedChange={(checked) => handleGeocodingChange(checked === true)}
  className="mt-0.5"
/>
```

**Step 4: StepFieldMapping — replace raw table**

In `step-field-mapping.tsx` (lines 682-717): Replace raw `<table>` with shadcn `Table`:

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@timetiles/ui";

<Table>
  <TableHeader>
    <TableRow className="border-cartographic-navy/10 bg-cartographic-cream/20">
      {activeMapping.titleField && <TableHead className="text-cartographic-charcoal font-medium">Title</TableHead>}
      {activeMapping.dateField && <TableHead className="text-cartographic-charcoal font-medium">Date</TableHead>}
      {activeMapping.locationField && <TableHead className="text-cartographic-charcoal font-medium">Location</TableHead>}
    </TableRow>
  </TableHeader>
  <TableBody>
    {activeSheet.sampleData.slice(0, 3).map((row, i) => (
      <TableRow key={i} className="border-cartographic-navy/5 last:border-0">
        {activeMapping.titleField && <TableCell className="text-cartographic-charcoal">{formatCellValue(row[activeMapping.titleField])}</TableCell>}
        {activeMapping.dateField && <TableCell className="text-cartographic-navy/70 font-mono">{formatCellValue(row[activeMapping.dateField])}</TableCell>}
        {activeMapping.locationField && <TableCell className="text-cartographic-navy/70">{formatCellValue(row[activeMapping.locationField])}</TableCell>}
      </TableRow>
    ))}
  </TableBody>
</Table>
```

**Step 5: StepUpload — replace raw button**

In `step-upload.tsx` (line 380): Replace raw `<button>` with shadcn `Button`:

```tsx
<Button
  type="button"
  variant="ghost"
  size="sm"
  onClick={toggleAuthConfig}
  className="text-muted-foreground hover:text-foreground gap-1"
>
  {showAuthConfig ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
  Authentication settings
</Button>
```

**Step 6: Build and verify**

Run: `make check-ai`
Expected: PASS

**Step 7: Commit**

```bash
git add -A
git commit -m "refactor: replace raw HTML elements with shadcn components in import pages"
```

---

### Task 8: Replace inline SVGs in RegisterForm

**Files:**
- Modify: `apps/web/components/auth/register-form.tsx:125-137,152-158`

**Step 1: Replace lock SVG with Lucide icon**

In `register-form.tsx` (lines 125-137): Replace the inline `<svg>` lock icon with:

```tsx
import { Lock, Mail } from "lucide-react";

// Line 125-137 replacement:
<Lock className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
```

**Step 2: Replace envelope SVG with Lucide icon**

In `register-form.tsx` (lines 152-158): Replace the inline `<svg>` envelope icon with:

```tsx
<Mail className="text-primary mx-auto mb-4 h-12 w-12" />
```

**Step 3: Build and verify**

Run: `make check-ai PACKAGE=web`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/web/components/auth/register-form.tsx
git commit -m "refactor: replace inline SVGs with Lucide icons in RegisterForm"
```

---

### Task 9: Final verification

**Step 1: Run full check**

Run: `make check-ai`
Expected: PASS — all lint, typecheck passes

**Step 2: Run all tests**

Run: `make test-ai`
Expected: All tests pass

**Step 3: Fix any issues**

If tests fail, investigate and fix. Common issues:
- Snapshot tests may need updating if component output changed
- Mock setups may need updating if prop interfaces changed
- Import paths may need adjustment

**Step 4: Final commit (if any fixes)**

```bash
git add -A
git commit -m "fix: address test/lint issues from UI standardization"
```
