import { buildConfig } from "payload";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { postgresAdapter } from "@payloadcms/db-postgres";
import sharp from "sharp";

// Import collections
import Catalogs from "./lib/collections/Catalogs";
import Datasets from "./lib/collections/Datasets";
import Imports from "./lib/collections/Imports";
import Events from "./lib/collections/Events";
import Users from "./lib/collections/Users";
import Media from "./lib/collections/Media";
import LocationCache from "./lib/collections/LocationCache";
import GeocodingProviders from "./lib/collections/GeocodingProviders";
import { MainMenu } from "./lib/collections/MainMenu";
import { Pages } from "./lib/collections/Pages";

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
