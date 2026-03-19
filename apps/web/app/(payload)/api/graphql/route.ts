/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
/* DO NOT MODIFY IT BECAUSE IT COULD BE REWRITTEN AT ANY TIME. */
import config from "@payload-config";
import { GRAPHQL_POST, REST_OPTIONS } from "@payloadcms/next/routes";
import type { NextRequest } from "next/server";

// Wrapper to handle Next.js route handler type compatibility
export const POST = async (request: NextRequest) => {
  const handler = GRAPHQL_POST(config);
  // @ts-expect-error -- @payloadcms/next route handlers expect 1 arg but Next.js 16 route API requires 2 (request, context)
  return handler(request, { params: Promise.resolve({}) });
};

export const OPTIONS = async (request: NextRequest) => {
  const handler = REST_OPTIONS(config);
  return handler(request, { params: Promise.resolve({}) });
};
