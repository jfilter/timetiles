import { describe, test, expect } from 'vitest';
import { renderWithProviders, screen } from '../test-utils';
import { EventsList } from '@/components/EventsList';
import type { Event } from '@/payload-types';

const mockEvents: Event[] = [
  {
    id: 1,
    dataset: 1,
    location: {
      latitude: 52.52,
      longitude: 13.405,
    },
    eventTimestamp: '1945-05-08T00:00:00Z',
    data: {
      title: 'VE Day',
      description: 'Victory in Europe Day',
      city: 'Berlin',
      country: 'Germany',
      startDate: '1945-05-08',
      endDate: '1945-05-08',
    },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 2,
    dataset: 1,
    location: {
      latitude: 43.7696,
      longitude: 11.2558,
    },
    data: {
      name: 'Renaissance Event',
      city: 'Florence',
      country: 'Italy',
    },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 3,
    dataset: 2,
    geocodingInfo: {
      normalizedAddress: '123 Main St, New York, NY 10001',
    },
    data: {
      title: 'Modern Event',
    },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

describe('EventsList', () => {
  test('renders loading state', () => {
    renderWithProviders(<EventsList events={[]} loading={true} />);
    
    expect(screen.getByText('Loading events...')).toBeInTheDocument();
  });

  test('renders empty state when no events', () => {
    renderWithProviders(<EventsList events={[]} loading={false} />);
    
    expect(screen.getByText('No events found')).toBeInTheDocument();
  });

  test('renders event cards correctly', () => {
    renderWithProviders(<EventsList events={mockEvents} loading={false} />);
    
    // Check first event with title
    expect(screen.getByText('VE Day')).toBeInTheDocument();
    expect(screen.getByText('Victory in Europe Day')).toBeInTheDocument();
    expect(screen.getByText('Berlin, Germany')).toBeInTheDocument();
    
    // Check second event with name instead of title
    expect(screen.getByText('Renaissance Event')).toBeInTheDocument();
    expect(screen.getByText('Florence, Italy')).toBeInTheDocument();
    
    // Check third event with geocoded address
    expect(screen.getByText('Modern Event')).toBeInTheDocument();
    expect(screen.getByText('123 Main St, New York, NY 10001')).toBeInTheDocument();
  });

  test('handles missing data gracefully', () => {
    const eventWithMissingData: Event[] = [
      {
        id: 4,
        dataset: 1,
        data: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ];
    
    renderWithProviders(<EventsList events={eventWithMissingData} loading={false} />);
    
    // Should show fallback title
    expect(screen.getByText('Event 4')).toBeInTheDocument();
  });

  test('formats dates correctly', () => {
    renderWithProviders(<EventsList events={mockEvents} loading={false} />);
    
    // Check date formatting (will depend on locale)
    const dateElement = screen.getByText((content, element) => {
      return content.includes('5/8/1945') || content.includes('08/05/1945');
    });
    expect(dateElement).toBeInTheDocument();
  });

  test('displays coordinates when available', () => {
    renderWithProviders(<EventsList events={mockEvents} loading={false} />);
    
    // Check coordinates display
    expect(screen.getByText('52.5200, 13.4050')).toBeInTheDocument();
    expect(screen.getByText('43.7696, 11.2558')).toBeInTheDocument();
  });

  test('handles non-object data field', () => {
    const eventWithStringData: Event[] = [
      {
        id: 5,
        dataset: 1,
        data: 'string data',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ];
    
    renderWithProviders(<EventsList events={eventWithStringData} loading={false} />);
    
    // Should show fallback title
    expect(screen.getByText('Event 5')).toBeInTheDocument();
  });

  test('renders date ranges correctly', () => {
    const eventWithDateRange: Event[] = [
      {
        id: 6,
        dataset: 1,
        data: {
          title: 'Multi-day Event',
          startDate: '2024-06-26',
          endDate: '2024-06-30',
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ];
    
    renderWithProviders(<EventsList events={eventWithDateRange} loading={false} />);
    
    // Should show date range with separator
    const dateText = screen.getByText((content, element) => {
      return element?.tagName === 'DIV' && 
             content.includes(' - ') &&
             (content.includes('6/26/2024') || content.includes('26/06/2024'));
    });
    expect(dateText).toBeInTheDocument();
  });
});