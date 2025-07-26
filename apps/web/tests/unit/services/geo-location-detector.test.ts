import { GeoLocationDetector } from "../../../lib/services/import/geo-location-detector";

describe("GeoLocationDetector", () => {
  let detector: GeoLocationDetector;

  beforeEach(() => {
    detector = new GeoLocationDetector();
  });

  describe("column detection", () => {
    it("detects standard lat/lon columns", () => {
      const headers = ["lat", "lon", "title", "date"];
      const sampleRows = [
        { lat: "40.7128", lon: "-74.0060", title: "NYC", date: "2024-01-01" },
        { lat: "51.5074", lon: "-0.1278", title: "London", date: "2024-01-02" },
      ];

      const result = detector.detectGeoColumns(headers, sampleRows);

      expect(result.found).toBe(true);
      expect(result.type).toBe("separate");
      expect(result.latColumn).toBe("lat");
      expect(result.lonColumn).toBe("lon");
      expect(result.detectionMethod).toBe("pattern");
    });

    it("detects uppercase variations (LAT, LONG)", () => {
      const headers = ["LAT", "LONG", "name"];
      const sampleRows = [
        { LAT: "40.7128", LONG: "-74.0060", name: "NYC" },
        { LAT: "51.5074", LONG: "-0.1278", name: "London" },
      ];

      const result = detector.detectGeoColumns(headers, sampleRows);

      expect(result.found).toBe(true);
      expect(result.type).toBe("separate");
      expect(result.latColumn).toBe("LAT");
      expect(result.lonColumn).toBe("LONG");
    });

    it("detects underscore variants (lat_deg, long_deg)", () => {
      const headers = ["lat_deg", "long_deg", "description"];
      const sampleRows = [{ lat_deg: "40.7128", long_deg: "-74.0060", description: "test" }];

      const result = detector.detectGeoColumns(headers, sampleRows);

      expect(result.found).toBe(true);
      expect(result.latColumn).toBe("lat_deg");
      expect(result.lonColumn).toBe("long_deg");
    });

    it("detects spelled out versions (latitude, longitude)", () => {
      const headers = ["latitude", "longitude", "city"];
      const sampleRows = [{ latitude: "40.7128", longitude: "-74.0060", city: "NYC" }];

      const result = detector.detectGeoColumns(headers, sampleRows);

      expect(result.found).toBe(true);
      expect(result.latColumn).toBe("latitude");
      expect(result.lonColumn).toBe("longitude");
    });

    it("detects coordinate columns (x_coord, y_coord)", () => {
      const headers = ["y_coordinate", "x_coordinate", "name"];
      const sampleRows = [{ y_coordinate: "40.7128", x_coordinate: "-74.0060", name: "NYC" }];

      const result = detector.detectGeoColumns(headers, sampleRows);

      expect(result.found).toBe(true);
      expect(result.latColumn).toBe("y_coordinate");
      expect(result.lonColumn).toBe("x_coordinate");
    });

    it("detects swapped coordinates", () => {
      const headers = ["lat", "lon", "title"];
      const sampleRows = [
        { lat: "139.6503", lon: "35.6762", title: "Tokyo" }, // Swapped (139 > 90)
        { lat: "151.2093", lon: "-33.8688", title: "Sydney" }, // Swapped (151 > 90)
        { lat: "-122.4194", lon: "37.7749", title: "San Francisco" }, // Swapped (122 > 90)
        { lat: "174.7633", lon: "-36.8485", title: "Auckland" }, // Swapped (174 > 90)
      ];

      const result = detector.detectGeoColumns(headers, sampleRows);

      expect(result.found).toBe(true);
      expect(result.swappedCoordinates).toBe(true);
    });
  });

  describe("combined column detection", () => {
    it('detects "lat,lon" format', () => {
      const headers = ["coordinates", "title", "date"];
      const sampleRows = [
        { coordinates: "40.7128,-74.0060", title: "NYC", date: "2024-01-01" },
        { coordinates: "51.5074,-0.1278", title: "London", date: "2024-01-02" },
      ];

      const result = detector.detectGeoColumns(headers, sampleRows);

      expect(result.found).toBe(true);
      expect(result.type).toBe("combined");
      expect(result.combinedColumn).toBe("coordinates");
      expect(result.format).toBe("combined_comma");
    });

    it('detects "lat lon" space-separated', () => {
      const headers = ["position", "name"];
      const sampleRows = [
        { position: "40.7128 -74.0060", name: "NYC" },
        { position: "51.5074 -0.1278", name: "London" },
      ];

      const result = detector.detectGeoColumns(headers, sampleRows);

      expect(result.found).toBe(true);
      expect(result.type).toBe("combined");
      expect(result.combinedColumn).toBe("position");
      expect(result.format).toBe("combined_space");
    });

    it("detects GeoJSON format", () => {
      const headers = ["location", "title"];
      const sampleRows = [
        {
          location: JSON.stringify({
            type: "Point",
            coordinates: [-74.006, 40.7128],
          }),
          title: "NYC",
        },
        {
          location: JSON.stringify({
            type: "Point",
            coordinates: [-0.1278, 51.5074],
          }),
          title: "London",
        },
      ];

      const result = detector.detectGeoColumns(headers, sampleRows);

      expect(result.found).toBe(true);
      expect(result.type).toBe("combined");
      expect(result.format).toBe("geojson");
    });
  });

  describe("heuristic detection", () => {
    it("identifies columns with coordinate-like values", () => {
      const headers = ["col1", "col2", "col3", "col4"];
      const sampleRows = [
        { col1: "40.7128", col2: "-74.0060", col3: "NYC", col4: "2024" },
        { col1: "51.5074", col2: "-0.1278", col3: "London", col4: "2024" },
        { col1: "48.8566", col2: "2.3522", col3: "Paris", col4: "2024" },
        { col1: "35.6762", col2: "139.6503", col3: "Tokyo", col4: "2024" },
        { col1: "-33.8688", col2: "151.2093", col3: "Sydney", col4: "2024" },
      ];

      const result = detector.detectGeoColumns(headers, sampleRows);

      expect(result.found).toBe(true);
      expect(result.type).toBe("separate");
      expect(result.detectionMethod).toBe("heuristic");
      expect(result.latColumn).toBe("col1");
      expect(result.lonColumn).toBe("col2");
    });

    it("ignores columns with out-of-range values", () => {
      const headers = ["col1", "col2", "col3"];
      const sampleRows = [
        { col1: "200", col2: "300", col3: "text" }, // Out of range
        { col1: "201", col2: "301", col3: "more text" },
      ];

      const result = detector.detectGeoColumns(headers, sampleRows);

      expect(result.found).toBe(false);
    });

    it("requires minimum valid samples", () => {
      const headers = ["maybe_lat", "maybe_lon", "title"];
      const sampleRows = [
        { maybe_lat: "40.7128", maybe_lon: "-74.0060", title: "NYC" },
        { maybe_lat: "invalid", maybe_lon: "invalid", title: "Bad" },
        { maybe_lat: "", maybe_lon: "", title: "Empty" },
        { maybe_lat: null, maybe_lon: null, title: "Null" },
      ];

      const result = detector.detectGeoColumns(headers, sampleRows);

      expect(result.found).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles empty data", () => {
      const headers: string[] = [];
      const sampleRows: any[] = [];

      const result = detector.detectGeoColumns(headers, sampleRows);

      expect(result.found).toBe(false);
    });

    it("handles missing values", () => {
      const headers = ["lat", "lon", "title"];
      const sampleRows = [
        { lat: "40.7128", lon: "-74.0060", title: "NYC" },
        { lat: null, lon: null, title: "Missing" },
        { lat: "", lon: "", title: "Empty" },
        { lat: "51.5074", lon: "-0.1278", title: "London" },
      ];

      const result = detector.detectGeoColumns(headers, sampleRows);

      expect(result.found).toBe(true);
      // With 2 valid samples out of 2 non-null samples, confidence should be 1.0
      expect(result.confidence).toBe(1);
    });

    it("handles various number formats", () => {
      const headers = ["lat", "lon"];
      const sampleRows = [
        { lat: 40.7128, lon: -74.006 }, // Numbers
        { lat: "51.5074", lon: "-0.1278" }, // Strings
        { lat: " 48.8566 ", lon: " 2.3522 " }, // With spaces
      ];

      const result = detector.detectGeoColumns(headers, sampleRows);

      expect(result.found).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.9);
    });
  });
});
