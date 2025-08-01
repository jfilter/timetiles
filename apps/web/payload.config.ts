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

if (!secret) {
  throw new Error("PAYLOAD_SECRET environment variable is required");
}

if (!serverURL) {
  throw new Error("NEXT_PUBLIC_PAYLOAD_URL environment variable is required");
}

if (!connectionString) {
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
  secret,
  serverURL,
  typescript: DEFAULT_TYPESCRIPT_CONFIG,
  db: postgresAdapter({
    ...DEFAULT_DB_CONFIG,
    pool: {
      connectionString: connectionString,
    },
  }),
  cors: [serverURL],
  csrf: [serverURL],
  sharp: sharp as any,
  upload: DEFAULT_UPLOAD_CONFIG,
  graphQL: {
    disable: true,
  },
});
