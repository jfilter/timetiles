import { describe, test, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/events/route';
import { NextRequest } from 'next/server';

// Mock payload
vi.mock('@payloadcms/next/utilities', () => ({
  getPayloadHMR: vi.fn(() => Promise.resolve({
    find: vi.fn(),
  })),
}));

// Mock config
vi.mock('../../payload.config', () => ({
  default: {},
}));

describe('Events API Route', () => {
  let mockPayload: any;
  
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getPayloadHMR } = await import('@payloadcms/next/utilities');
    mockPayload = await (getPayloadHMR as any)();
  });

  test('returns events without filters', async () => {
    const mockEvents = {
      docs: [
        { id: 1, title: 'Event 1' },
        { id: 2, title: 'Event 2' },
      ],
      totalDocs: 2,
      limit: 1000,
      page: 1,
    };
    
    mockPayload.find.mockResolvedValue(mockEvents);
    
    const request = new NextRequest('http://localhost:3000/api/events');
    const response = await GET(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual(mockEvents);
    
    expect(mockPayload.find).toHaveBeenCalledWith({
      collection: 'events',
      where: {},
      limit: 1000,
      depth: 2,
    });
  });

  test('filters by catalog', async () => {
    mockPayload.find.mockResolvedValue({ docs: [], totalDocs: 0 });
    
    const request = new NextRequest('http://localhost:3000/api/events?catalog=1');
    await GET(request);
    
    expect(mockPayload.find).toHaveBeenCalledWith({
      collection: 'events',
      where: {
        or: [
          {
            'dataset.catalog': {
              equals: '1',
            },
          },
        ],
      },
      limit: 1000,
      depth: 2,
    });
  });

  test('filters by multiple datasets', async () => {
    mockPayload.find.mockResolvedValue({ docs: [], totalDocs: 0 });
    
    const request = new NextRequest('http://localhost:3000/api/events?datasets=1&datasets=2');
    await GET(request);
    
    expect(mockPayload.find).toHaveBeenCalledWith({
      collection: 'events',
      where: {
        or: [
          {
            dataset: {
              in: ['1', '2'],
            },
          },
        ],
      },
      limit: 1000,
      depth: 2,
    });
  });

  test('filters by bounds', async () => {
    mockPayload.find.mockResolvedValue({ docs: [], totalDocs: 0 });
    
    const bounds = {
      west: -10,
      east: 10,
      south: -5,
      north: 5,
    };
    
    const request = new NextRequest(
      `http://localhost:3000/api/events?bounds=${encodeURIComponent(JSON.stringify(bounds))}`
    );
    await GET(request);
    
    expect(mockPayload.find).toHaveBeenCalledWith({
      collection: 'events',
      where: {
        and: [
          {
            'location.longitude': {
              greater_than_equal: -10,
              less_than_equal: 10,
            },
          },
          {
            'location.latitude': {
              greater_than_equal: -5,
              less_than_equal: 5,
            },
          },
        ],
      },
      limit: 1000,
      depth: 2,
    });
  });

  test('filters by date range', async () => {
    mockPayload.find.mockResolvedValue({ docs: [], totalDocs: 0 });
    
    const request = new NextRequest(
      'http://localhost:3000/api/events?startDate=2024-01-01&endDate=2024-12-31'
    );
    await GET(request);
    
    const call = mockPayload.find.mock.calls[0][0];
    expect(call.collection).toBe('events');
    expect(call.where.and).toBeDefined();
    expect(call.where.and[0].or).toBeDefined();
    
    // Check eventTimestamp filter
    const timestampFilter = call.where.and[0].or[0];
    expect(timestampFilter.eventTimestamp.greater_than_equal).toMatch(/2024-01-01/);
    expect(timestampFilter.eventTimestamp.less_than).toMatch(/2025-01-01/); // End date + 1 day
  });

  test('combines multiple filters', async () => {
    mockPayload.find.mockResolvedValue({ docs: [], totalDocs: 0 });
    
    const bounds = { west: -10, east: 10, south: -5, north: 5 };
    const request = new NextRequest(
      `http://localhost:3000/api/events?catalog=1&startDate=2024-01-01&bounds=${encodeURIComponent(JSON.stringify(bounds))}`
    );
    await GET(request);
    
    const call = mockPayload.find.mock.calls[0][0];
    expect(call.where.or).toBeDefined(); // Catalog filter
    expect(call.where.and).toBeDefined(); // Bounds and date filters
    expect(call.where.and.length).toBeGreaterThan(2); // Multiple AND conditions
  });

  test('handles invalid bounds gracefully', async () => {
    mockPayload.find.mockResolvedValue({ docs: [], totalDocs: 0 });
    
    const request = new NextRequest(
      'http://localhost:3000/api/events?bounds=invalid-json'
    );
    await GET(request);
    
    // Should still call find, just without bounds filter
    expect(mockPayload.find).toHaveBeenCalledWith({
      collection: 'events',
      where: {},
      limit: 1000,
      depth: 2,
    });
  });

  test('handles errors', async () => {
    mockPayload.find.mockRejectedValue(new Error('Database error'));
    
    const request = new NextRequest('http://localhost:3000/api/events');
    const response = await GET(request);
    
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: 'Failed to fetch events' });
  });
});