import type { CoordinateValidator } from "@/lib/services/import/coordinate-validator";

import { getObjectProperty } from "./data-parsing";
import { hasValidProperty, parseDate, parseTagsFromRow, safeStringValue } from "./data-validation";

export const extractCoordinatesFromRow = (
  row: Record<string, unknown>,
  columnMapping: {
    latitudeColumn?: string;
    longitudeColumn?: string;
    combinedColumn?: string;
    coordinateFormat?: string;
  },
  coordinateValidator: CoordinateValidator,
): { coordinates?: { lat: number; lng: number }; validation?: Record<string, unknown> } => {
  const { latitudeColumn, longitudeColumn, combinedColumn, coordinateFormat } = columnMapping;

  try {
    // Try separate lat/lng columns first
    const separateResult = extractSeparateCoordinates(row, latitudeColumn, longitudeColumn, coordinateValidator);
    if (separateResult.coordinates) {
      return separateResult;
    }

    // Try combined coordinate column
    const combinedResult = extractCombinedCoordinates(row, combinedColumn, coordinateFormat, coordinateValidator);
    if (combinedResult.coordinates) {
      return combinedResult;
    }
  } catch {
    // Coordinate extraction failed, will fall back to geocoding
  }

  return {};
};

const extractSeparateCoordinates = (
  row: Record<string, unknown>,
  latitudeColumn?: string,
  longitudeColumn?: string,
  coordinateValidator?: CoordinateValidator,
): { coordinates?: { lat: number; lng: number }; validation?: Record<string, unknown> } => {
  if (latitudeColumn == null || longitudeColumn == null || coordinateValidator == null) {
    return {};
  }

  const latValue = getObjectProperty(row, latitudeColumn);
  const lngValue = getObjectProperty(row, longitudeColumn);

  if (latValue == null || lngValue == null) {
    return {};
  }

  // Convert to string safely - check for primitives first
  const latStr = typeof latValue === "string" || typeof latValue === "number" ? String(latValue) : "";
  const lngStr = typeof lngValue === "string" || typeof lngValue === "number" ? String(lngValue) : "";

  if (!latStr || !lngStr) {
    return {};
  }

  const result = parseAndValidateCoordinates(latStr, lngStr, coordinateValidator);
  return result ?? {};
};

const extractCombinedCoordinates = (
  row: Record<string, unknown>,
  combinedColumn?: string,
  coordinateFormat?: string,
  coordinateValidator?: CoordinateValidator,
): { coordinates?: { lat: number; lng: number }; validation?: Record<string, unknown> } => {
  if (combinedColumn == null || combinedColumn.length === 0 || coordinateValidator == null) {
    return {};
  }

  const combinedValue = getObjectProperty(row, combinedColumn);
  if (combinedValue == null) {
    return {};
  }

  // Convert to string safely - only process string and number types
  if (typeof combinedValue !== "string" && typeof combinedValue !== "number") {
    return {};
  }

  const coordString = String(combinedValue).trim();
  const coords = parseCombinedCoordinates(coordString, coordinateFormat);

  if (coords == null) {
    return {};
  }

  const result = parseAndValidateCoordinates(String(coords.lat), String(coords.lng), coordinateValidator);
  return result ?? {};
};

const parseCombinedCoordinates = (
  coordString: string,
  coordinateFormat?: string,
): { lat: number; lng: number } | null => {
  let parts: string[] = [];

  if (coordinateFormat === "combined_comma") {
    parts = coordString.split(",").map((p) => p.trim());
  } else if (coordinateFormat === "combined_space") {
    parts = coordString.split(/\s+/);
  }

  if (parts.length !== 2) {
    return null;
  }

  const lat = Number(parts[0]);
  const lng = Number(parts[1]);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }

  return { lat, lng };
};

const parseAndValidateCoordinates = (
  latStr: string,
  lngStr: string,
  coordinateValidator: CoordinateValidator,
): { coordinates: { lat: number; lng: number }; validation: Record<string, unknown> } | null => {
  const lat = Number(latStr);
  const lng = Number(lngStr);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }

  const lat_parsed = coordinateValidator.parseCoordinate(String(lat));
  const lng_parsed = coordinateValidator.parseCoordinate(String(lng));

  if (lat_parsed === null || lng_parsed === null) {
    return null;
  }

  const validation = {
    isValid: true,
    normalizedLat: lat_parsed,
    normalizedLng: lng_parsed,
  };

  return {
    coordinates: { lat: validation.normalizedLat, lng: validation.normalizedLng },
    validation: validation,
  };
};

export const processRowData = (
  row: Record<string, unknown>,
  hasCoordinates: boolean,
  columnMapping: Record<string, unknown> | undefined,
  coordinateValidator: CoordinateValidator,
): Record<string, unknown> => {
  // Normalize and validate data
  const processedRow: Record<string, unknown> = {
    title: safeStringValue(row, "title"),
    description: safeStringValue(row, "description") ?? "",
    date: parseDate(safeStringValue(row, "date") ?? ""),
    endDate: hasValidProperty(row, "enddate") ? parseDate(safeStringValue(row, "enddate") ?? "") : null,
    location: safeStringValue(row, "location") ?? "",
    address: safeStringValue(row, "address") ?? "",
    url: safeStringValue(row, "url") ?? "",
    category: safeStringValue(row, "category") ?? "",
    tags: parseTagsFromRow(row),
    originalData: row,
  };

  // Extract coordinates if detected
  if (hasCoordinates && columnMapping) {
    const extractedCoords = extractCoordinatesFromRow(
      row,
      columnMapping as {
        latitudeColumn?: string;
        longitudeColumn?: string;
        combinedColumn?: string;
        coordinateFormat?: string;
      },
      coordinateValidator,
    );

    if (extractedCoords.coordinates) {
      processedRow.preExistingCoordinates = extractedCoords.coordinates;
      processedRow.skipGeocoding = true;
      if (extractedCoords.validation) {
        processedRow.coordinateValidation = extractedCoords.validation;
      }
    }
  }

  return processedRow;
};
