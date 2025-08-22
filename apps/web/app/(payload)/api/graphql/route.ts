/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
/* DO NOT MODIFY IT BECAUSE IT COULD BE REWRITTEN AT ANY TIME. */
import config from "@payload-config";
import { GRAPHQL_POST, REST_OPTIONS } from "@payloadcms/next/routes";
import type { NextRequest } from "next/server";

// Wrapper to handle Next.js 15.5 type compatibility
export const POST = async (request: NextRequest) => {
  const handler = GRAPHQL_POST(config);
  // @ts-ignore - Temporary fix for Next.js 15.5 type incompatibility
  return handler(request, { params: Promise.resolve({}) });
};

export const OPTIONS = async (request: NextRequest) => {
  const handler = REST_OPTIONS(config);
  // @ts-ignore - Temporary fix for Next.js 15.5 type incompatibility
  return handler(request, { params: Promise.resolve({}) });
};
