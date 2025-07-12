import { NextRequest, NextResponse } from "next/server";
import { getPayloadHMR } from "@payloadcms/next/utilities";
import config from '../../../payload.config';

export async function GET(request: NextRequest) {
  try {
    const payload = await getPayloadHMR({ config });
    const searchParams = request.nextUrl.searchParams;
    
    const catalog = searchParams.get("catalog");
    const datasets = searchParams.getAll("datasets");
    const boundsParam = searchParams.get("bounds");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    
    const where: any = {};
    
    if (catalog || datasets.length > 0) {
      const datasetQuery: any[] = [];
      
      if (catalog && datasets.length === 0) {
        datasetQuery.push({
          "dataset.catalog": {
            equals: catalog,
          },
        });
      }
      
      if (datasets.length > 0) {
        datasetQuery.push({
          dataset: {
            in: datasets,
          },
        });
      }
      
      if (datasetQuery.length > 0) {
        where.or = datasetQuery;
      }
    }
    
    if (boundsParam) {
      try {
        const bounds = JSON.parse(boundsParam);
        where.and = [
          ...(where.and || []),
          {
            "location.longitude": {
              greater_than_equal: bounds.west,
              less_than_equal: bounds.east,
            },
          },
          {
            "location.latitude": {
              greater_than_equal: bounds.south,
              less_than_equal: bounds.north,
            },
          },
        ];
      } catch (error) {
        console.error("Invalid bounds parameter:", error);
      }
    }
    
    // Add date filtering
    if (startDate || endDate) {
      const dateFilters: any = {};
      
      if (startDate) {
        dateFilters.greater_than_equal = new Date(startDate).toISOString();
      }
      
      if (endDate) {
        // Add 1 day to include the entire end date
        const endDateTime = new Date(endDate);
        endDateTime.setDate(endDateTime.getDate() + 1);
        dateFilters.less_than = endDateTime.toISOString();
      }
      
      // First try to filter by eventTimestamp
      const timestampFilter = {
        eventTimestamp: dateFilters
      };
      
      // Also prepare a filter for data field in case events store dates there
      const dataFieldFilters = [];
      if (startDate) {
        dataFieldFilters.push({
          or: [
            { "data.startDate": { greater_than_equal: new Date(startDate).toISOString() } },
            { "data.date": { greater_than_equal: new Date(startDate).toISOString() } },
            { "data.eventDate": { greater_than_equal: new Date(startDate).toISOString() } }
          ]
        });
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setDate(endDateTime.getDate() + 1);
        dataFieldFilters.push({
          or: [
            { "data.endDate": { less_than: endDateTime.toISOString() } },
            { "data.date": { less_than: endDateTime.toISOString() } },
            { "data.eventDate": { less_than: endDateTime.toISOString() } }
          ]
        });
      }
      
      // Combine filters - try eventTimestamp first, fallback to data fields
      where.and = [
        ...(where.and || []),
        {
          or: [
            timestampFilter,
            ...(dataFieldFilters.length > 0 ? [{ and: dataFieldFilters }] : [])
          ]
        }
      ];
    }
    
    const events = await payload.find({
      collection: "events",
      where,
      limit: 1000,
      depth: 2,
    });
    
    return NextResponse.json(events);
  } catch (error) {
    console.error("Error fetching events:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 }
    );
  }
}