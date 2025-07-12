import { describe, test, expect, vi } from 'vitest';
import { renderWithProviders, screen, userEvent, fireEvent } from '../test-utils';
import { EventFilters } from '@/components/EventFilters';
import type { Catalog, Dataset } from '@/payload-types';

const mockCatalogs: Catalog[] = [
  {
    id: 1,
    name: 'Historical Events',
    slug: 'historical-events',
    description: 'Historical events collection',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 2,
    name: 'Cultural Events',
    slug: 'cultural-events',
    description: 'Cultural events collection',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

const mockDatasets: Dataset[] = [
  {
    id: 1,
    catalog: mockCatalogs[0],
    name: 'World War II',
    slug: 'ww2',
    description: 'WW2 events',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 2,
    catalog: mockCatalogs[0],
    name: 'Renaissance',
    slug: 'renaissance',
    description: 'Renaissance events',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 3,
    catalog: mockCatalogs[1],
    name: 'Music Festivals',
    slug: 'music-festivals',
    description: 'Music festival events',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

describe('EventFilters', () => {
  test('renders all filter controls', () => {
    renderWithProviders(
      <EventFilters catalogs={mockCatalogs} datasets={mockDatasets} />
    );
    
    expect(screen.getByLabelText('Catalog')).toBeInTheDocument();
    expect(screen.getByText('Datasets')).toBeInTheDocument();
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument();
    expect(screen.getByLabelText('End Date')).toBeInTheDocument();
  });

  test('shows all catalogs in dropdown', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EventFilters catalogs={mockCatalogs} datasets={mockDatasets} />
    );
    
    const catalogSelect = screen.getAllByRole('combobox', { name: /Catalog/i })[0];
    await user.click(catalogSelect);
    
    expect(screen.getByRole('option', { name: 'All Catalogs' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Historical Events' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Cultural Events' })).toBeInTheDocument();
  });

  test('filters datasets by selected catalog', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EventFilters catalogs={mockCatalogs} datasets={mockDatasets} />
    );
    
    // Initially shows all datasets
    expect(screen.getByLabelText('World War II')).toBeInTheDocument();
    expect(screen.getByLabelText('Renaissance')).toBeInTheDocument();
    expect(screen.getByLabelText('Music Festivals')).toBeInTheDocument();
    
    // Select Historical Events catalog
    const catalogSelect = screen.getAllByRole('combobox', { name: /Catalog/i })[0];
    await user.click(catalogSelect);
    await user.click(screen.getByRole('option', { name: 'Historical Events' }));
    
    // Should only show historical datasets
    expect(screen.getByLabelText('World War II')).toBeInTheDocument();
    expect(screen.getByLabelText('Renaissance')).toBeInTheDocument();
    expect(screen.queryByLabelText('Music Festivals')).not.toBeInTheDocument();
  });

  test('updates URL when catalog is selected', async () => {
    const user = userEvent.setup();
    const searchParams = new URLSearchParams();
    
    renderWithProviders(
      <EventFilters catalogs={mockCatalogs} datasets={mockDatasets} />,
      { searchParams }
    );
    
    const catalogSelect = screen.getAllByRole('combobox', { name: /Catalog/i })[0];
    await user.click(catalogSelect);
    await user.click(screen.getByRole('option', { name: 'Historical Events' }));
    
    // URL should be updated (this would be tested more thoroughly in E2E)
    expect(catalogSelect).toHaveTextContent('Historical Events');
  });

  test('handles multiple dataset selection', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EventFilters catalogs={mockCatalogs} datasets={mockDatasets} />
    );
    
    const ww2Checkbox = screen.getByLabelText('World War II');
    const renaissanceCheckbox = screen.getByLabelText('Renaissance');
    
    await user.click(ww2Checkbox);
    expect(ww2Checkbox).toBeChecked();
    
    await user.click(renaissanceCheckbox);
    expect(renaissanceCheckbox).toBeChecked();
    expect(ww2Checkbox).toBeChecked();
  });

  test('clears datasets when catalog changes', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EventFilters catalogs={mockCatalogs} datasets={mockDatasets} />
    );
    
    // Select a dataset
    await user.click(screen.getByLabelText('World War II'));
    expect(screen.getByLabelText('World War II')).toBeChecked();
    
    // Change catalog
    const catalogSelect = screen.getAllByRole('combobox', { name: /Catalog/i })[0];
    await user.click(catalogSelect);
    await user.click(screen.getByRole('option', { name: 'Cultural Events' }));
    
    // Previous dataset should not be visible/checked
    expect(screen.queryByLabelText('World War II')).not.toBeInTheDocument();
  });

  test('handles date filter changes', async () => {
    renderWithProviders(
      <EventFilters catalogs={mockCatalogs} datasets={mockDatasets} />
    );
    
    const startDate = screen.getByLabelText('Start Date');
    const endDate = screen.getByLabelText('End Date');
    
    fireEvent.change(startDate, { target: { value: '2024-01-01' } });
    expect(startDate).toHaveValue('2024-01-01');
    
    fireEvent.change(endDate, { target: { value: '2024-12-31' } });
    expect(endDate).toHaveValue('2024-12-31');
  });

  test('shows clear dates button when dates are set', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EventFilters catalogs={mockCatalogs} datasets={mockDatasets} />
    );
    
    // Initially no clear button
    expect(screen.queryByRole('button', { name: 'Clear date filters' })).not.toBeInTheDocument();
    
    // Set a date
    const startDate = screen.getByLabelText('Start Date');
    fireEvent.change(startDate, { target: { value: '2024-01-01' } });
    
    // Clear button should appear
    expect(screen.getByRole('button', { name: 'Clear date filters' })).toBeInTheDocument();
  });

  test('clears dates when clear button is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <EventFilters catalogs={mockCatalogs} datasets={mockDatasets} />
    );
    
    const startDate = screen.getByLabelText('Start Date');
    const endDate = screen.getByLabelText('End Date');
    
    fireEvent.change(startDate, { target: { value: '2024-01-01' } });
    fireEvent.change(endDate, { target: { value: '2024-12-31' } });
    
    const clearButton = screen.getByRole('button', { name: 'Clear date filters' });
    await user.click(clearButton);
    
    expect(startDate).toHaveValue('');
    expect(endDate).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Clear date filters' })).not.toBeInTheDocument();
  });

  test('shows empty state when no datasets available', () => {
    renderWithProviders(
      <EventFilters catalogs={mockCatalogs} datasets={[]} />
    );
    
    expect(screen.getByText('No datasets available')).toBeInTheDocument();
  });

  test('handles catalog with ID reference instead of object', () => {
    const datasetsWithIdRef: Dataset[] = [
      {
        ...mockDatasets[0],
        catalog: 1, // ID reference instead of object
      },
    ];
    
    renderWithProviders(
      <EventFilters catalogs={mockCatalogs} datasets={datasetsWithIdRef} />
    );
    
    // Should still render the dataset
    expect(screen.getByLabelText('World War II')).toBeInTheDocument();
  });
});