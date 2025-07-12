import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { ThemeProvider } from '@/components/ThemeProvider';
import { vi } from 'vitest';

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  searchParams?: URLSearchParams;
}

function AllTheProviders({ 
  children,
  searchParams = new URLSearchParams()
}: { 
  children: React.ReactNode;
  searchParams?: URLSearchParams;
}) {
  return (
    <NuqsTestingAdapter searchParams={searchParams}>
      <ThemeProvider>
        {children}
      </ThemeProvider>
    </NuqsTestingAdapter>
  );
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: CustomRenderOptions
) {
  const { searchParams, ...renderOptions } = options || {};
  
  return render(ui, {
    wrapper: ({ children }) => (
      <AllTheProviders searchParams={searchParams}>{children}</AllTheProviders>
    ),
    ...renderOptions
  });
}

// Mock MapLibre GL
export const mockMapLibre = () => {
  const mockMap = {
    on: vi.fn((event: string, callback: Function) => {
      if (event === 'load') {
        setTimeout(() => callback(), 100);
      }
    }),
    remove: vi.fn(),
    getBounds: vi.fn(() => ({
      getWest: () => -180,
      getEast: () => 180,
      getSouth: () => -90,
      getNorth: () => 90,
    })),
    addControl: vi.fn(),
  };

  const mockMarker = {
    setLngLat: vi.fn(() => mockMarker),
    setPopup: vi.fn(() => mockMarker),
    addTo: vi.fn(() => mockMarker),
    remove: vi.fn(),
  };

  const mockPopup = {
    setHTML: vi.fn(() => mockPopup),
  };

  return {
    Map: vi.fn(() => mockMap),
    Marker: vi.fn(() => mockMarker),
    Popup: vi.fn(() => mockPopup),
    mockMap,
    mockMarker,
    mockPopup,
  };
};

// Re-export everything
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';