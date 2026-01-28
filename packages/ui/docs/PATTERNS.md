# Design Patterns

> **Part of the TimeTiles Cartographic Design System**
> See [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) for complete design guidance

Common UI patterns and workflows for TimeTiles. Patterns are higher-level than components — they describe how components work together to solve user problems.

## Form Patterns

### Form Validation

**Progressive validation** - Validate as users complete fields, not on every keystroke.

**Validation states:**

```tsx
// ✅ Success state
<Input
  value={value}
  state="success"
  helperText="Dataset name available"
/>

// ⚠️ Warning state
<Input
  value={value}
  state="warning"
  helperText="Name is similar to existing dataset"
/>

// ❌ Error state
<Input
  value={value}
  state="error"
  helperText="Dataset name is required"
/>
```

**Validation timing:**
- **On blur:** Validate when user leaves field (most common)
- **On submit:** Validate all fields when form submitted
- **Real-time:** Only for async checks (username availability, duplicate names)

**Error message placement:**
- Place inline below the field
- Use color + icon (not color alone for accessibility)
- Be specific: "Dataset name is required" not "Required field"

### Multi-Step Forms (Wizards)

**Example: Import wizard**

```tsx
<Wizard currentStep={2} totalSteps={4}>
  <WizardStep
    number={1}
    status="complete"
    title="Upload File"
  />
  <WizardStep
    number={2}
    status="current"
    title="Map Fields"
  />
  <WizardStep
    number={3}
    status="pending"
    title="Review"
  />
  <WizardStep
    number={4}
    status="pending"
    title="Import"
  />
</Wizard>
```

**Best practices:**
- Show progress (step 2 of 4)
- Allow going back to previous steps
- Validate each step before proceeding
- Save progress automatically (don't lose work)
- Show summary in final step

### Required vs Optional Fields

**Mark optional fields, not required:**
- ✅ "Description (optional)"
- ❌ "Dataset name *"

**Rationale:** Most fields should be required. Marking optional fields is clearer.

## Error Patterns

### Error Types

#### Inline Errors (Field-level)

Used for validation errors on specific fields.

```tsx
<FormField error="Dataset name is required">
  <Label>Dataset name</Label>
  <Input state="error" />
</FormField>
```

#### Alert Errors (Form-level)

Used for errors affecting multiple fields or general issues.

```tsx
<Alert variant="error">
  <AlertTitle>Import failed</AlertTitle>
  <AlertDescription>
    CSV file is missing required columns: date, location
  </AlertDescription>
</Alert>
```

#### Toast Errors (Global)

Used for async operation failures.

```tsx
<Toast variant="error">
  Geocoding failed: API rate limit exceeded. Try again in 5 minutes.
</Toast>
```

#### Page Errors (System-level)

Used for 404, 500, network errors.

```tsx
<ErrorPage
  code="404"
  title="Dataset not found"
  description="The dataset you're looking for doesn't exist or has been deleted."
  action={<Button href="/datasets">View All Datasets</Button>}
/>
```

### Error Recovery

**Always provide a way forward:**

| Error Type | Recovery Action |
|------------|-----------------|
| Validation error | Show what's wrong + how to fix |
| Network error | "Retry" button |
| Permission error | Link to request access |
| Not found | Link to relevant page |
| Rate limit | Show when to try again |

### Error Message Structure

**Format:** [What went wrong] + [Why] + [How to fix]

**Examples:**
- ✅ "Import failed: File too large (52 MB). Files must be under 50 MB. Split into smaller files."
- ✅ "Geocoding incomplete: 15 addresses not found. Review and correct addresses in the validation step."
- ❌ "Error occurred"
- ❌ "Something went wrong. Please try again."

## Loading Patterns

### Loading States by Context

#### Page Loading

```tsx
<PageSkeleton>
  <HeaderSkeleton />
  <ContentSkeleton />
</PageSkeleton>
```

#### Component Loading

```tsx
<Card>
  <CardHeader>
    <CardTitle>Events</CardTitle>
  </CardHeader>
  <CardContent>
    {isLoading ? (
      <Skeleton className="h-48 w-full" />
    ) : (
      <EventsList events={events} />
    )}
  </CardContent>
</Card>
```

#### Button Loading

```tsx
<Button disabled={isLoading}>
  {isLoading && <Spinner className="mr-2" />}
  {isLoading ? "Importing..." : "Import Dataset"}
</Button>
```

#### Inline Loading

```tsx
<div className="flex items-center gap-2">
  <Spinner size="sm" />
  <span className="text-sm text-muted-foreground">
    Geocoding 1,234 addresses...
  </span>
</div>
```

### Progress Indicators

**Use when operation takes >3 seconds:**

```tsx
<Progress value={progress} max={100} />
<p className="text-sm text-muted-foreground mt-2">
  Processed {current} of {total} events ({progress}%)
</p>
```

**Show specific progress when possible:**
- ✅ "Geocoding 234 of 1,234 addresses (19%)"
- ❌ "Processing..."

### Skeleton Screens

**Use for initial page loads:**

```tsx
<Card>
  <CardHeader>
    <Skeleton className="h-6 w-32" /> {/* Title */}
  </CardHeader>
  <CardContent className="space-y-2">
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-4 w-5/6" />
  </CardContent>
</Card>
```

**Match content structure:** Skeletons should mirror actual content layout.

## Empty State Patterns

### Empty States by Context

#### No Data Yet (First Use)

```tsx
<EmptyState
  icon={<FileIcon />}
  title="No datasets yet"
  description="Import your first dataset to visualize events on a map."
  action={<Button>Import Dataset</Button>}
/>
```

#### No Results (Filtered)

```tsx
<EmptyState
  icon={<FilterIcon />}
  title="No events match your filters"
  description="Try adjusting your date range or location filters."
  action={<Button variant="outline">Clear Filters</Button>}
/>
```

#### Error State (Failed to Load)

```tsx
<EmptyState
  icon={<AlertTriangleIcon />}
  variant="error"
  title="Failed to load datasets"
  description="Network error occurred. Check your connection and try again."
  action={<Button>Retry</Button>}
/>
```

### Empty State Structure

**Always include:**
1. **Icon** - Visual representation (not decorative)
2. **Title** - Clear statement of what's empty
3. **Description** - Why it's empty + what to do
4. **Action** - Button to resolve (when applicable)

## Confirmation Patterns

### Confirmation Dialogs

**Use for destructive actions only:**

```tsx
<AlertDialog>
  <AlertDialogTitle>Delete dataset?</AlertDialogTitle>
  <AlertDialogDescription>
    This will permanently delete "Climate Events 2024" and its 1,234 events.
    This action cannot be undone.
  </AlertDialogDescription>
  <AlertDialogFooter>
    <AlertDialogCancel>Cancel</AlertDialogCancel>
    <AlertDialogAction variant="destructive">
      Delete Dataset
    </AlertDialogAction>
  </AlertDialogFooter>
</AlertDialog>
```

**Best practices:**
- Be specific about what will be deleted
- Explain consequences
- Use destructive button variant
- Make cancel easy (Escape key, backdrop click)

### Inline Confirmation

**For less destructive actions:**

```tsx
{showConfirm ? (
  <div className="flex gap-2">
    <Button size="sm" variant="outline" onClick={() => setShowConfirm(false)}>
      Cancel
    </Button>
    <Button size="sm" variant="destructive" onClick={handleDelete}>
      Confirm Delete
    </Button>
  </div>
) : (
  <Button size="sm" variant="ghost" onClick={() => setShowConfirm(true)}>
    Delete
  </Button>
)}
```

### Toast Confirmation

**For successful actions that can be undone:**

```tsx
<Toast>
  Dataset deleted
  <ToastAction onClick={handleUndo}>Undo</ToastAction>
</Toast>
```

## Search & Filter Patterns

### Search Pattern

```tsx
<div className="relative">
  <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
  <Input
    placeholder="Search datasets..."
    className="pl-9"
    value={query}
    onChange={(e) => setQuery(e.target.value)}
  />
</div>
```

**Best practices:**
- Show search icon (not just placeholder)
- Real-time search for local data
- Debounced search for API calls (300ms)
- Show count: "234 results for 'climate'"

### Filter Pattern

```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline">
      <FilterIcon className="mr-2 h-4 w-4" />
      Filters {activeFilters > 0 && `(${activeFilters})`}
    </Button>
  </PopoverTrigger>
  <PopoverContent>
    <div className="space-y-4">
      <div>
        <Label>Date Range</Label>
        <DateRangePicker />
      </div>
      <div>
        <Label>Location</Label>
        <Select>...</Select>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={clearFilters}>
          Clear
        </Button>
        <Button onClick={applyFilters}>
          Apply Filters
        </Button>
      </div>
    </div>
  </PopoverContent>
</Popover>
```

**Show active filter count** - Users should know filters are active.

## Authentication Patterns

### Login Form

```tsx
<Card className="w-full max-w-md">
  <CardHeader>
    <CardTitle>Sign in to TimeTiles</CardTitle>
    <CardDescription>
      Enter your credentials to access your datasets
    </CardDescription>
  </CardHeader>
  <CardContent>
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        <FormField>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
          />
        </FormField>
        <FormField>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </FormField>
        <Button type="submit" className="w-full">
          Sign In
        </Button>
      </div>
    </form>
  </CardContent>
  <CardFooter>
    <Link href="/forgot-password" className="text-sm text-muted-foreground">
      Forgot password?
    </Link>
  </CardFooter>
</Card>
```

### Protected Route Pattern

```tsx
// Redirect to login if not authenticated
if (!user) {
  return <Navigate to="/login" state={{ from: location }} />;
}

// Show content if authenticated
return <DashboardContent />;
```

### Permission Error

```tsx
<EmptyState
  icon={<LockIcon />}
  variant="warning"
  title="Access restricted"
  description="You don't have permission to view this dataset. Contact the owner to request access."
  action={<Button variant="outline" onClick={goBack}>Go Back</Button>}
/>
```

## Pagination Patterns

### Simple Pagination

```tsx
<div className="flex items-center justify-between">
  <p className="text-sm text-muted-foreground">
    Showing {start} to {end} of {total} results
  </p>
  <div className="flex gap-2">
    <Button
      variant="outline"
      size="sm"
      disabled={!hasPrevious}
      onClick={goToPrevious}
    >
      Previous
    </Button>
    <Button
      variant="outline"
      size="sm"
      disabled={!hasNext}
      onClick={goToNext}
    >
      Next
    </Button>
  </div>
</div>
```

### Load More Pattern

**For infinite scroll alternative:**

```tsx
<div>
  {items.map(item => <ItemCard key={item.id} {...item} />)}

  {hasMore && (
    <Button
      variant="outline"
      className="w-full"
      onClick={loadMore}
      disabled={isLoading}
    >
      {isLoading ? "Loading..." : "Load More"}
    </Button>
  )}
</div>
```

## Pattern Checklist

When implementing a pattern:

- [ ] Does it match user expectations?
- [ ] Is it accessible (keyboard, screen reader)?
- [ ] Does it handle loading states?
- [ ] Does it handle error states?
- [ ] Does it handle empty states?
- [ ] Does it provide clear feedback?
- [ ] Is the content clear and actionable?

---

**Need more patterns?** Open an issue to request documentation for specific workflows.
