import type { Field } from "payload";

export const geocodingFields: Field[] = [
  {
    name: "geocodingStats",
    type: "group",
    fields: [
      {
        name: "totalAddresses",
        type: "number",
        defaultValue: 0,
        admin: {
          description: "Total addresses to geocode",
        },
      },
      {
        name: "successfulGeocodes",
        type: "number",
        defaultValue: 0,
        admin: {
          description: "Successfully geocoded addresses",
        },
      },
      {
        name: "failedGeocodes",
        type: "number",
        defaultValue: 0,
        admin: {
          description: "Failed geocoding attempts",
        },
      },
      {
        name: "cachedResults",
        type: "number",
        defaultValue: 0,
        admin: {
          description: "Results from cache",
        },
      },
      {
        name: "googleApiCalls",
        type: "number",
        defaultValue: 0,
        admin: {
          description: "Google Maps API calls made",
        },
      },
      {
        name: "nominatimApiCalls",
        type: "number",
        defaultValue: 0,
        admin: {
          description: "Nominatim API calls made",
        },
      },
      {
        name: "preExistingCoordinates",
        type: "number",
        defaultValue: 0,
        admin: {
          description: "Rows with coordinates from import",
        },
      },
      {
        name: "skippedGeocoding",
        type: "number",
        defaultValue: 0,
        admin: {
          description: "Rows where geocoding was skipped",
        },
      },
    ],
    admin: {
      description: "Geocoding statistics",
    },
  },
];
