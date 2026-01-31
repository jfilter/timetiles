# UI Standardization: Error States, Loading Patterns, and Component Consistency

**Date:** 2026-01-30
**Audit items:** 2.3, 2.4, 4.1–4.3, 4.5, 4.6

---

## Problem

The codebase has:

- 4 components with no error handling (`EventsList`, `EventHistogram`, `AggregationBarChart`, `ClusteredMap`)
- 5 different loading patterns (inline text, skeletons, button state, emoji spinners, overlay)
- 4 different error display patterns (inline red text, alert box, dedicated component, `ChartEmptyState`)
- Raw HTML elements (`<select>`, `<input>`, `<button>`, `<table>`, `<svg>`) in import pages instead of shadcn components
- Hardcoded color values instead of design system tokens

---

## Design

### 1. Shared `ContentState` Component

**Location:** `packages/ui/src/components/content-state.tsx`
**Exported from:** `@timetiles/ui`

A general-purpose component for empty, no-match, and error states in any content area.

```typescript
interface ContentStateProps {
  variant: "empty" | "no-match" | "error";
  icon?: React.ReactNode;
  title?: string;
  subtitle?: string;
  onRetry?: () => void;
  height?: number | string;
  className?: string;
}
```

**Defaults per variant:**

| Variant | Icon | Title | Subtitle |
|---------|------|-------|----------|
| `empty` | `Inbox` | "No data yet" | "There's nothing to show" |
| `no-match` | `Filter` | "No matching results" | "Try adjusting your filters" |
| `error` | `AlertTriangle` | "Something went wrong" | "There was a problem loading this content" |

The error variant shows a retry button when `onRetry` is provided.

**Refactors:**

- `ChartEmptyState` becomes a thin wrapper passing chart-specific defaults (custom `EmptyChartIcon`, chart-oriented messages) to `ContentState`. Public API unchanged.
- `EventDetailError` uses `ContentState` internally, keeping its business logic for "not found" vs generic error messages.

### 2. Standardized Loading Patterns

Two patterns, chosen by context:

- **Skeleton loading** — for content areas (lists, charts, detail views)
- **Button state change** — for user-initiated actions (form submits, uploads). Button shows `Loader2` spinner + action text, inputs disabled.

| Component | Current | After |
|-----------|---------|-------|
| `EventsList` | Inline "Loading events..." text | `EventsListSkeleton` (already exists) |
| `ImportUpload` | Emoji spinners (`⏳`) | `Loader2` from lucide-react with `animate-spin` |
| `EventsListPaginated` load-more button | Custom CSS spinner div | `Loader2` from lucide-react with `animate-spin` |
| `ClusteredMap` | Loading overlay only, no error | Keep overlay, add error overlay using `ContentState` |

### 3. Error States for Components Missing Them

Each component gets error handling using `ContentState`:

| Component | Approach |
|-----------|----------|
| `EventsList` | Accept `error` prop, render `ContentState variant="error"` with retry |
| `EventHistogram` | Pass query error through to `ChartEmptyState` (which wraps `ContentState`) |
| `AggregationBarChart` | Pass query error through to `ChartEmptyState` |
| `ClusteredMap` | Error overlay alongside existing `MapLoadingOverlay`, using `ContentState` |

### 4. Raw HTML Replacement in Import Pages

**Add shadcn components to `packages/ui`:**

- `Table` (TableHeader, TableBody, TableRow, TableHead, TableCell)

**Replacements:**

| File | Raw HTML | Replacement |
|------|----------|-------------|
| `StepFieldMapping` | `<select>` (lines 184, 304, 333, 342) | shadcn `Select` |
| `StepFieldMapping` | `<input type="checkbox">` (line 597) | shadcn `Checkbox` |
| `StepFieldMapping` | `<table>` (line 682) | shadcn `Table` |
| `StepUpload` | `<button>` (line 380) | shadcn `Button variant="ghost"` |
| `ImportUpload` | Progress bar divs with `bg-gray-200`, `bg-green-600` | Design tokens (`bg-muted`, `bg-primary`) |
| `RegisterForm` | Inline `<svg>` icons (lines 125, 152) | Lucide `Lock`, `Mail` icons |

---

## Files Changed

### New files

- `packages/ui/src/components/content-state.tsx`
- `packages/ui/src/components/table.tsx` (shadcn Table)
- `packages/ui/src/components/checkbox.tsx` (shadcn Checkbox)

### Modified files

**packages/ui:**
- `src/components/charts/chart-empty-state.tsx` — refactor to wrap `ContentState`
- `src/index.ts` — export new components

**apps/web (error states):**
- `app/(frontend)/explore/_components/events-list.tsx` — add error prop + `ContentState`
- `components/charts/event-histogram.tsx` — pass error to `ChartEmptyState`
- `components/charts/aggregation-bar-chart.tsx` — pass error to `ChartEmptyState`
- `components/maps/clustered-map.tsx` — add error overlay
- `components/events/event-detail-content.tsx` — refactor `EventDetailError` to use `ContentState`

**apps/web (loading):**
- `app/(frontend)/explore/_components/events-list.tsx` — use `EventsListSkeleton`
- `app/(frontend)/import/_components/import-upload.tsx` — replace emoji spinners
- `app/(frontend)/explore/_components/events-list-paginated.tsx` — replace CSS spinner

**apps/web (raw HTML):**
- `app/(frontend)/import/_components/steps/step-field-mapping.tsx` — shadcn Select, Checkbox, Table
- `app/(frontend)/import/_components/steps/step-upload.tsx` — shadcn Button
- `app/(frontend)/import/_components/import-upload.tsx` — design token colors
- `components/auth/register-form.tsx` — Lucide icons

---

## Implementation Order

1. Create `ContentState` in `packages/ui`
2. Add shadcn `Table` and `Checkbox` to `packages/ui`
3. Refactor `ChartEmptyState` to wrap `ContentState`
4. Add error states to `EventsList`, charts, `ClusteredMap`
5. Refactor `EventDetailError`
6. Standardize loading patterns (skeletons, replace emoji/CSS spinners)
7. Replace raw HTML in import pages
8. Replace inline SVGs in `RegisterForm`
9. Verify: `make check-ai` and `make test-ai`
