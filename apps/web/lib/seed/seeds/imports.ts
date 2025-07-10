import type { Import } from "../../../payload-types";

// Use Payload type with specific modifications for seed data
export type ImportSeed = Omit<Import, 'id' | 'createdAt' | 'updatedAt' | 'catalog' | 'user' | 'importedAt' | 'completedAt'> & {
  catalog: string; // This will be resolved to catalog ID during seeding
  importedAt?: Date; // Use Date object for easier seed data handling
  completedAt?: Date; // Use Date object for easier seed data handling
};

export function importSeeds(environment: string): ImportSeed[] {
  const baseImports: ImportSeed[] = [
    {
      fileName: "air_quality_2024_01_15.csv",
      originalName: "Air Quality Data - January 15, 2024",
      catalog: "environmental-data",
      fileSize: 15240,
      mimeType: "text/csv",
      status: "completed",
      importedAt: new Date("2024-01-15T09:00:00Z"),
      completedAt: new Date("2024-01-15T09:05:00Z"),
      rowCount: 2,
      errorCount: 0,
      metadata: {
        source: "Environmental Agency API",
        import_type: "scheduled",
        columns: [
          "station_id",
          "timestamp",
          "pm25",
          "pm10",
          "o3",
          "no2",
          "location",
        ],
      },
    },
    {
      fileName: "gdp_q4_2023.json",
      originalName: "GDP Data Q4 2023",
      catalog: "economic-indicators",
      fileSize: 8920,
      mimeType: "application/json",
      status: "completed",
      importedAt: new Date("2024-01-01T10:00:00Z"),
      completedAt: new Date("2024-01-01T10:02:00Z"),
      rowCount: 2,
      errorCount: 0,
      metadata: {
        source: "World Bank API",
        import_type: "manual",
        data_period: "Q4 2023",
      },
    },
  ];

  if (environment === "test") {
    // Return test-specific imports, include one more than production
    return [
      ...baseImports,
      {
        fileName: "test_data.csv",
        originalName: "Test Data File",
        catalog: "test-catalog",
        fileSize: 1024,
        mimeType: "text/csv",
        status: "completed",
        importedAt: new Date("2024-01-01T12:00:00Z"),
        completedAt: new Date("2024-01-01T12:01:00Z"),
        rowCount: 2,
        errorCount: 1,
        errorLog: 'Row 2: Invalid data type for field "value"',
        metadata: {
          source: "test",
          import_type: "test",
        },
      },
    ];
  }

  if (environment === "development") {
    return [
      ...baseImports,
      {
        fileName: "social_media_20240115.xlsx",
        originalName: "Social Media Engagement - January 15, 2024",
        catalog: "social-media-analytics",
        fileSize: 45600,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        status: "completed",
        importedAt: new Date("2024-01-16T08:00:00Z"),
        completedAt: new Date("2024-01-16T08:03:00Z"),
        rowCount: 2,
        errorCount: 0,
        metadata: {
          source: "Social Media Analytics Platform",
          import_type: "scheduled",
          platforms: ["twitter", "facebook"],
        },
      },
      {
        fileName: "weather_historical_2020.csv",
        originalName: "Historical Weather Data 2020",
        catalog: "historical-records",
        fileSize: 125000,
        mimeType: "text/csv",
        status: "completed",
        importedAt: new Date("2020-12-31T23:30:00Z"),
        completedAt: new Date("2020-12-31T23:45:00Z"),
        rowCount: 1,
        errorCount: 0,
        metadata: {
          source: "Weather Station Archive",
          import_type: "bulk_historical",
          data_period: "2020",
        },
      },
      {
        fileName: "failed_import.csv",
        originalName: "Failed Import Example",
        catalog: "environmental-data",
        fileSize: 2048,
        mimeType: "text/csv",
        status: "failed",
        importedAt: new Date("2024-01-10T14:00:00Z"),
        rowCount: 0,
        errorCount: 100,
        errorLog: "File format validation failed: Invalid CSV structure",
        metadata: {
          source: "manual_upload",
          import_type: "manual",
          failure_reason: "Invalid file format",
        },
      },
    ];
  }

  return baseImports;
}
