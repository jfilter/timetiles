import { buildConfig } from "payload";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { postgresAdapter } from "@payloadcms/db-postgres";
import sharp from "sharp";

// Import collections
import Catalogs from "./lib/collections/catalogs";
import Datasets from "./lib/collections/datasets";
import Imports from "./lib/collections/imports";
import Events from "./lib/collections/events";
import Users from "./lib/collections/users";
import Media from "./lib/collections/media";
import LocationCache from "./lib/collections/location-cache";
import GeocodingProviders from "./lib/collections/geocoding-providers";
import { MainMenu } from "./lib/collections/main-menu";
import { Pages } from "./lib/collections/pages";

// Import job definitions
import {
  fileParsingJob,
  batchProcessingJob,
  eventCreationJob,
  geocodingBatchJob,
} from "./lib/jobs/import-jobs";

export default buildConfig({
  admin: {
    user: Users.slug,
  },
  collections: [
    Catalogs,
    Datasets,
    Imports,
    Events,
    Users,
    Media,
    LocationCache,
    GeocodingProviders,
    Pages,
  ],
  globals: [MainMenu],
  jobs: {
    tasks: [
      fileParsingJob,
      batchProcessingJob,
      eventCreationJob,
      geocodingBatchJob,
    ],
  },
  editor: lexicalEditor({}),
  secret: process.env.PAYLOAD_SECRET ?? "your-secret-key",
  serverURL: process.env.NEXT_PUBLIC_PAYLOAD_URL ?? "http://localhost:3000",
  typescript: {
    outputFile: "./payload-types.ts",
  },
  db: postgresAdapter({
    push: false, // Disable automatic schema updates
    pool: {
      connectionString:
        process.env.DATABASE_URL ??
        "postgresql://timetiles_user:timetiles_password@localhost:5432/timetiles",
    },
    schemaName: "payload",
    migrationDir: "./migrations",
    transactionOptions: {
      isolationLevel: "read committed",
    },
  }),
  cors: ["http://localhost:3000"],
  csrf: ["http://localhost:3000"],
  sharp,
});
