/**
 * @module
 */
// Mock MapLibre GL JS
class MockMap {
  private readonly container: HTMLElement;
  private listeners: { [key: string]: ((...args: any[]) => void)[] } = {};
  private markers: any[] = [];

  constructor(options: any) {
    this.container = options.container;
    this.container.innerHTML = '<div class="maplibregl-map"></div>';
  }

  on(event: string, handler: (...args: any[]) => void) {
    this.listeners[event] ??= [];
    this.listeners[event].push(handler);

    // Immediately trigger load event
    if (event === "load") {
      setTimeout(() => handler({ target: this }), 0);
    }

    return this;
  }

  off(event: string, handler: (...args: any[]) => void) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((h) => h !== handler);
    }
    return this;
  }

  emit(event: string, data?: any) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((handler) => handler(data));
    }
  }

  getBounds() {
    return {
      getNorth: () => 90,
      getSouth: () => -90,
      getEast: () => 180,
      getWest: () => -180,
      toArray: () => [
        [-180, -90],
        [180, 90],
      ],
    };
  }

  fitBounds() {
    // Simulate bounds change
    setTimeout(() => {
      this.emit("moveend", { target: this });
    }, 10);
    return this;
  }

  remove() {
    this.container.innerHTML = "";
    Object.keys(this.listeners).forEach((event) => {
      this.listeners[event] = [];
    });
    this.markers.forEach((marker) => marker.remove());
    this.markers = [];
  }

  addControl() {
    return this;
  }

  _trackMarker(marker: any) {
    this.markers.push(marker);
  }
}

class MockMarker {
  private map: MockMap | null = null;
  private popup: MockPopup | null = null;
  private readonly element: HTMLElement;

  constructor(options?: any) {
    this.element = document.createElement("div");
    this.element.className = "maplibregl-marker";
    if (options?.element) {
      this.element = options.element;
    }
  }

  setLngLat(coords?: [number, number]) {
    if (coords) {
      this.element.dataset.lng = String(coords[0]);
      this.element.dataset.lat = String(coords[1]);
    }
    return this;
  }

  setPopup(popup: MockPopup) {
    this.popup = popup;
    return this;
  }

  addTo(map: MockMap) {
    this.map = map;
    map._trackMarker(this);
    return this;
  }

  remove() {
    if (this.map) {
      this.element.remove();
    }
    return this;
  }

  getElement() {
    return this.element;
  }
}

class MockPopup {
  private content: string = "";

  setHTML(html: string) {
    this.content = html;
    return this;
  }

  setLngLat() {
    return this;
  }

  addTo() {
    return this;
  }

  remove() {
    return this;
  }
}

class MockNavigationControl {}

const mockMapLibre = {
  Map: MockMap,
  Marker: MockMarker,
  Popup: MockPopup,
  NavigationControl: MockNavigationControl,
};

// Default export required by mock system
export default mockMapLibre;
