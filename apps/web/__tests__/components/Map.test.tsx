import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, waitFor } from '../test-utils';
import { Map } from '@/components/Map';
import maplibregl from 'maplibre-gl';

const mockMapLibre = maplibregl as any;

describe('Map', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders map container', () => {
    renderWithProviders(<Map />);
    
    const mapContainer = document.querySelector('.w-full.h-full');
    expect(mapContainer).toHaveClass('w-full h-full');
  });

  test('initializes MapLibre with correct config', async () => {
    renderWithProviders(<Map />);
    
    await waitFor(() => {
      expect(mockMapLibre.Map).toHaveBeenCalledWith({
        container: expect.any(HTMLDivElement),
        style: 'https://tiles.versatiles.org/assets/styles/colorful/style.json',
        center: [0, 40],
        zoom: 2,
      });
    });
  });

  test('calls onBoundsChange when map moves', async () => {
    const onBoundsChange = vi.fn();
    renderWithProviders(<Map onBoundsChange={onBoundsChange} />);
    
    // Wait for map to load
    await waitFor(() => {
      expect(mockMapLibre.Map).toHaveBeenCalled();
    });
    
    const mockMapInstance = mockMapLibre.Map.mock.results[0].value;
    
    // Simulate map move
    if (mockMapInstance._moveEndCallback) {
      mockMapInstance._moveEndCallback();
    }
    
    expect(onBoundsChange).toHaveBeenCalledWith(expect.objectContaining({
      getWest: expect.any(Function),
      getEast: expect.any(Function),
      getSouth: expect.any(Function),
      getNorth: expect.any(Function),
    }));
  });

  test('renders markers for events', async () => {
    const events = [
      { id: '1', longitude: 13.405, latitude: 52.52, title: 'Event 1' },
      { id: '2', longitude: 11.2558, latitude: 43.7696, title: 'Event 2' },
    ];
    
    renderWithProviders(<Map events={events} />);
    
    // Wait for map to load
    await waitFor(() => {
      expect(mockMapLibre.Map).toHaveBeenCalled();
    }, { timeout: 200 });
    
    // Wait a bit more for markers to be added
    await waitFor(() => {
      expect(mockMapLibre.Marker).toHaveBeenCalledTimes(2);
    });
    
    // Check markers were created with correct coordinates
    const markerCalls = mockMapLibre.Marker.mock.results;
    expect(markerCalls[0].value.setLngLat).toHaveBeenCalledWith([13.405, 52.52]);
    expect(markerCalls[1].value.setLngLat).toHaveBeenCalledWith([11.2558, 43.7696]);
    
    // Check popups were added
    expect(mockMapLibre.Popup).toHaveBeenCalledTimes(2);
    const popupCalls = mockMapLibre.Popup.mock.results;
    expect(popupCalls[0].value.setHTML).toHaveBeenCalledWith('<h3>Event 1</h3>');
    expect(popupCalls[1].value.setHTML).toHaveBeenCalledWith('<h3>Event 2</h3>');
  });

  test('removes old markers when events change', async () => {
    const { rerender } = renderWithProviders(
      <Map events={[{ id: '1', longitude: 0, latitude: 0, title: 'Event 1' }]} />
    );
    
    // Wait for initial markers
    await waitFor(() => {
      expect(mockMapLibre.Marker).toHaveBeenCalledTimes(1);
    });
    
    const firstMarker = mockMapLibre.Marker.mock.results[0].value;
    
    // Update events
    rerender(
      <Map events={[{ id: '2', longitude: 10, latitude: 10, title: 'Event 2' }]} />
    );
    
    // Wait for cleanup and new markers
    await waitFor(() => {
      expect(firstMarker.remove).toHaveBeenCalled();
      expect(mockMapLibre.Marker).toHaveBeenCalledTimes(2);
    });
  });

  test('handles events without title', async () => {
    const events = [
      { id: '1', longitude: 0, latitude: 0 },
    ];
    
    renderWithProviders(<Map events={events} />);
    
    await waitFor(() => {
      expect(mockMapLibre.Popup).toHaveBeenCalled();
    });
    
    const popupCall = mockMapLibre.Popup.mock.results[0].value;
    expect(popupCall.setHTML).toHaveBeenCalledWith('<h3>Event</h3>');
  });

  test('cleans up on unmount', async () => {
    const { unmount } = renderWithProviders(<Map />);
    
    await waitFor(() => {
      expect(mockMapLibre.Map).toHaveBeenCalled();
    });
    
    const mockMapInstance = mockMapLibre.Map.mock.results[0].value;
    
    unmount();
    
    expect(mockMapInstance.remove).toHaveBeenCalled();
  });

  test('does not recreate map on rerender', async () => {
    const { rerender } = renderWithProviders(<Map />);
    
    await waitFor(() => {
      expect(mockMapLibre.Map).toHaveBeenCalledTimes(1);
    });
    
    rerender(<Map />);
    
    // Should still only have been called once
    expect(mockMapLibre.Map).toHaveBeenCalledTimes(1);
  });

  test('handles empty events array', async () => {
    renderWithProviders(<Map events={[]} />);
    
    await waitFor(() => {
      expect(mockMapLibre.Map).toHaveBeenCalled();
    });
    
    // No markers should be created
    expect(mockMapLibre.Marker).not.toHaveBeenCalled();
  });
});