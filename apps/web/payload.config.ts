/**
 * @module
 */
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig } from "payload";
import sharp from "sharp";

import Users from "./lib/collections/users";
import {
  ALL_COLLECTIONS,
  ALL_GLOBALS,
  ALL_JOBS,
  DEFAULT_DB_CONFIG,
  DEFAULT_TYPESCRIPT_CONFIG,
  DEFAULT_UPLOAD_CONFIG,
} from "./lib/config/payload-shared-config";

const secret = process.env.PAYLOAD_SECRET;
const serverURL = process.env.NEXT_PUBLIC_PAYLOAD_URL;
const connectionString = process.env.DATABASE_URL;

// During build phase, Next.js sets NEXT_PHASE environment variable
// We can skip strict validation during build
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

if (!secret && !isBuildPhase) {
  throw new Error("PAYLOAD_SECRET environment variable is required");
}

if (!serverURL && !isBuildPhase) {
  throw new Error("NEXT_PUBLIC_PAYLOAD_URL environment variable is required");
}

if (!connectionString && !isBuildPhase) {
  throw new Error("DATABASE_URL environment variable is required");
}

export default buildConfig({
  admin: {
    user: Users.slug,
  },
  collections: ALL_COLLECTIONS,
  globals: ALL_GLOBALS,
  jobs: {
    tasks: ALL_JOBS,
  },
  editor: lexicalEditor({}),
  secret: secret || "dummy-build-secret",
  serverURL: serverURL || "http://localhost:3000",
  typescript: DEFAULT_TYPESCRIPT_CONFIG,
  db: postgresAdapter({
    ...DEFAULT_DB_CONFIG,
    pool: {
      connectionString: connectionString || "postgresql://build:build@localhost:5432/build",
    },
  }),
  cors: [serverURL || "http://localhost:3000"],
  csrf: [serverURL || "http://localhost:3000"],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sharp: sharp as any,
  upload: DEFAULT_UPLOAD_CONFIG,
  graphQL: {
    disable: true,
  },
});
