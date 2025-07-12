# Testing Guide for TimeTiles Map Explorer

This document describes the testing strategy and how to run tests for the TimeTiles map explorer feature.

## Testing Stack

- **Unit/Integration Tests**: Vitest + React Testing Library
- **E2E Tests**: Playwright
- **Test Coverage**: Vitest Coverage (c8)
- **CI/CD**: GitHub Actions

## Running Tests

### Unit Tests

```bash
# Run all unit tests
pnpm test:unit

# Run unit tests in watch mode
pnpm test:unit:watch

# Run with coverage
pnpm test:coverage
```

### E2E Tests

```bash
# Install Playwright browsers (first time only)
pnpm exec playwright install

# Run E2E tests
pnpm test:e2e

# Run E2E tests with UI mode (interactive)
pnpm test:e2e:ui

# Run E2E tests in headed mode (see browser)
pnpm test:e2e:headed

# Debug E2E tests
pnpm test:e2e:debug

# View test report after run
pnpm test:e2e:report
```

### Run All Tests

```bash
pnpm test:all
```

## Test Structure

```
apps/web/
├── __tests__/
│   ├── components/          # Component unit tests
│   │   ├── Map.test.tsx
│   │   ├── EventsList.test.tsx
│   │   ├── EventFilters.test.tsx
│   │   └── MapExplorer.test.tsx
│   ├── api/                # API route tests
│   │   └── events.test.ts
│   └── test-utils.tsx      # Test utilities and custom render
├── e2e/
│   ├── fixtures/           # Test data
│   │   └── test-data.ts
│   ├── pages/              # Page Object Models
│   │   └── explore.page.ts
│   └── specs/              # E2E test specs
│       ├── explore-basic.spec.ts
│       ├── explore-filtering.spec.ts
│       └── explore-map.spec.ts
└── playwright.config.ts    # Playwright configuration
```

## What's Tested

### Unit Tests

1. **Map Component**
   - Initialization with MapLibre
   - Marker rendering and updates
   - Bounds change callbacks
   - Cleanup on unmount

2. **EventsList Component**
   - Loading and empty states
   - Event card rendering
   - Date formatting
   - Handling missing data

3. **EventFilters Component**
   - Catalog selection
   - Dataset filtering by catalog
   - Date range selection
   - URL state synchronization

4. **Events API Route**
   - Query parameter parsing
   - Filter combinations
   - Error handling

### E2E Tests

1. **Basic Functionality**
   - Page loading
   - Component visibility
   - Responsive layout
   - Keyboard navigation

2. **Filtering**
   - Catalog/dataset selection
   - Date range filtering
   - Filter combinations
   - URL persistence

3. **Map Interactions**
   - Pan/zoom controls
   - Bounds-based filtering
   - Marker interactions
   - Popup display

## Writing New Tests

### Unit Test Example

```typescript
import { describe, test, expect } from 'vitest';
import { renderWithProviders, screen } from '../test-utils';
import { MyComponent } from '@/components/MyComponent';

describe('MyComponent', () => {
  test('renders correctly', () => {
    renderWithProviders(<MyComponent />);
    
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
});
```

### E2E Test Example

```typescript
import { test, expect } from '@playwright/test';
import { ExplorePage } from '../pages/explore.page';

test('my e2e test', async ({ page }) => {
  const explorePage = new ExplorePage(page);
  await explorePage.goto();
  
  // Your test logic here
  await expect(explorePage.map).toBeVisible();
});
```

## Debugging Tests

### Unit Tests
- Use `test.only()` to run a single test
- Add `console.log()` statements
- Use `screen.debug()` to see rendered output

### E2E Tests
- Use `--debug` flag for step-by-step debugging
- Use `--ui` mode for interactive testing
- Take screenshots: `await page.screenshot({ path: 'debug.png' })`
- Use trace viewer for failed tests

## CI/CD

Tests run automatically on:
- Push to main branch
- Pull requests

GitHub Actions workflow:
- Runs unit tests
- Runs E2E tests on multiple browsers
- Uploads test reports and videos

## Best Practices

1. **Keep tests focused** - One concern per test
2. **Use data-testid sparingly** - Prefer accessible queries
3. **Mock external dependencies** - Keep tests fast and reliable
4. **Use Page Object Model** - For E2E test maintainability
5. **Test user behavior** - Not implementation details
6. **Write descriptive test names** - Should explain what and why

## Troubleshooting

### Common Issues

1. **MapLibre not found**
   - Make sure maplibre-gl is properly mocked in unit tests
   - For E2E tests, ensure the page has fully loaded

2. **Flaky E2E tests**
   - Use proper wait strategies
   - Increase timeouts if needed
   - Check for race conditions

3. **Port conflicts**
   - Ensure port 3000 is free
   - Or update `playwright.config.ts` baseURL

4. **Test database issues**
   - Check PostgreSQL is running
   - Verify test database permissions

## Coverage Goals

- Overall: 80% minimum
- Critical paths: 100%
- New features: Must include tests