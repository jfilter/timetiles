import type { Field } from "payload";

export const coordinateFields: Field[] = [
  {
    name: "coordinateDetection",
    type: "group",
    fields: [
      {
        name: "detected",
        type: "checkbox",
        defaultValue: false,
        admin: {
          description: "Were coordinate columns detected in the import?",
        },
      },
      {
        name: "detectionMethod",
        type: "select",
        options: [
          { label: "Column Name Pattern", value: "pattern" },
          { label: "Heuristic Analysis", value: "heuristic" },
          { label: "User Specified", value: "manual" },
          { label: "Not Detected", value: "none" },
        ],
        admin: {
          condition: (data) =>
            (data as { coordinateDetection?: { detected?: boolean } }).coordinateDetection?.detected === true,
        },
      },
      {
        name: "columnMapping",
        type: "group",
        fields: [
          {
            name: "latitudeColumn",
            type: "text",
          },
          {
            name: "longitudeColumn",
            type: "text",
          },
          {
            name: "combinedColumn",
            type: "text",
          },
          {
            name: "coordinateFormat",
            type: "select",
            dbName: "coord_fmt",
            options: [
              { label: "Decimal Degrees", value: "decimal" },
              { label: "DMS (Degrees Minutes Seconds)", value: "dms" },
              { label: "Combined (lat,lon)", value: "combined_comma" },
              { label: "Combined (lat lon)", value: "combined_space" },
              { label: "GeoJSON", value: "geojson" },
            ],
          },
        ],
        admin: {
          condition: (data) =>
            (data as { coordinateDetection?: { detected?: boolean } }).coordinateDetection?.detected === true,
        },
      },
      {
        name: "detectionConfidence",
        type: "number",
        min: 0,
        max: 1,
        admin: {
          step: 0.01,
          description: "Confidence in coordinate detection (0-1)",
        },
      },
      {
        name: "sampleValidation",
        type: "group",
        fields: [
          {
            name: "validSamples",
            type: "number",
            defaultValue: 0,
          },
          {
            name: "invalidSamples",
            type: "number",
            defaultValue: 0,
          },
          {
            name: "swappedCoordinates",
            type: "checkbox",
            defaultValue: false,
            admin: {
              description: "Were lat/lon likely swapped?",
            },
          },
        ],
      },
    ],
    admin: {
      description: "Coordinate column detection information",
    },
  },
];
