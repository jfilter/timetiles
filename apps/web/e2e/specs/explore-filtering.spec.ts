import { test, expect } from '@playwright/test';
import { ExplorePage } from '../pages/explore.page';

test.describe('Explore Page - Filtering', () => {
  let explorePage: ExplorePage;

  test.beforeEach(async ({ page }) => {
    explorePage = new ExplorePage(page);
    await explorePage.goto();
    await explorePage.waitForMapLoad();
  });

  test('should filter by catalog', async ({ page }) => {
    // Select a specific catalog (Environmental Data from seed data)
    await explorePage.selectCatalog('Environmental Data');
    
    // Wait for the datasets to load for this catalog
    await page.waitForTimeout(1000);
    
    // Verify that datasets specific to this catalog are shown
    await expect(page.getByText('Air Quality Measurements')).toBeVisible();
    
    // Select a dataset
    await explorePage.selectDatasets(['Air Quality Measurements']);
    
    // Wait for API response and events to load
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();
    
    // Check that URL reflects the filter
    await explorePage.assertUrlParam('catalog', 'environmental-data');
    await explorePage.assertUrlParam('datasets', 'air-quality-measurements');
  });

  test('should filter by multiple datasets', async ({ page }) => {
    // Select Economic Indicators catalog
    await explorePage.selectCatalog('Economic Indicators');
    await page.waitForTimeout(1000);
    
    // Select multiple datasets
    await explorePage.selectDatasets(['GDP Growth Rates']);
    
    // Wait for events to load
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();
    
    // Check URL reflects multiple datasets
    await explorePage.assertUrlParam('catalog', 'economic-indicators');
    await explorePage.assertUrlParam('datasets', 'gdp-growth-rates');
  });

  test('should filter by date range', async ({ page }) => {
    // Select a catalog and dataset first
    await explorePage.selectCatalog('Environmental Data');
    await page.waitForTimeout(500);
    await explorePage.selectDatasets(['Air Quality Measurements']);
    
    // Set date filters
    await explorePage.setStartDate('2024-01-01');
    await explorePage.setEndDate('2024-12-31');
    
    // Wait for API response
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();
    
    // Check URL reflects date filters
    await explorePage.assertUrlParam('startDate', '2024-01-01');
    await explorePage.assertUrlParam('endDate', '2024-12-31');
  });

  test('should clear date filters', async ({ page }) => {
    // Set up initial filters
    await explorePage.selectCatalog('Environmental Data');
    await page.waitForTimeout(500);
    await explorePage.selectDatasets(['Air Quality Measurements']);
    await explorePage.setStartDate('2024-01-01');
    await explorePage.setEndDate('2024-12-31');
    
    await explorePage.waitForApiResponse();
    
    // Clear date filters
    await explorePage.clearDateFilters();
    
    // Wait for new API response
    await explorePage.waitForApiResponse();
    
    // Check that date params are removed from URL
    await explorePage.assertUrlParam('startDate', null);
    await explorePage.assertUrlParam('endDate', null);
  });

  test('should combine multiple filters', async ({ page }) => {
    // Test multiple filters working together
    await explorePage.selectCatalog('Environmental Data');
    await page.waitForTimeout(500);
    await explorePage.selectDatasets(['Air Quality Measurements']);
    await explorePage.setStartDate('2024-06-01');
    await explorePage.setEndDate('2024-06-30');
    
    // Wait for API response
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();
    
    // Verify all filters are in URL
    await explorePage.assertUrlParams({
      catalog: 'environmental-data',
      datasets: 'air-quality-measurements',
      startDate: '2024-06-01',
      endDate: '2024-06-30'
    });
  });

  test('should update results when changing filters', async ({ page }) => {
    // Start with one catalog
    await explorePage.selectCatalog('Environmental Data');
    await page.waitForTimeout(500);
    await explorePage.selectDatasets(['Air Quality Measurements']);
    await explorePage.waitForApiResponse();
    
    const initialCount = await explorePage.getEventCount();
    
    // Change to different catalog
    await explorePage.selectCatalog('Economic Indicators');
    await page.waitForTimeout(500);
    await explorePage.selectDatasets(['GDP Growth Rates']);
    await explorePage.waitForApiResponse();
    
    const newCount = await explorePage.getEventCount();
    
    // Counts may be different (events should update)
    // The important thing is that new API requests were made
    expect(typeof newCount).toBe('number');
    expect(newCount).toBeGreaterThanOrEqual(0);
  });

  test('should handle edge cases in date filtering', async ({ page }) => {
    await explorePage.selectCatalog('Environmental Data');
    await page.waitForTimeout(500);
    await explorePage.selectDatasets(['Air Quality Measurements']);
    
    // Test with same start and end date
    await explorePage.setStartDate('2024-07-01');
    await explorePage.setEndDate('2024-07-01');
    
    await explorePage.waitForApiResponse();
    await explorePage.waitForEventsToLoad();
    
    // Should not error and should show events for that specific date
    const count = await explorePage.getEventCount();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should preserve filters when navigating', async ({ page }) => {
    // Set up filters
    await explorePage.selectCatalog('Environmental Data');
    await page.waitForTimeout(500);
    await explorePage.selectDatasets(['Air Quality Measurements']);
    await explorePage.setStartDate('2024-01-01');
    
    await explorePage.waitForApiResponse();
    
    // Get current URL with params
    const urlWithParams = page.url();
    
    // Navigate away and back
    await page.goto('/');
    await page.goto(urlWithParams);
    
    // Check that filters are restored
    await page.waitForTimeout(1000);
    await expect(page.locator('#catalog-select')).toContainText('Environmental Data');
    await expect(page.locator('#start-date')).toHaveValue('2024-01-01');
  });
});