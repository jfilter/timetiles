/**
 * Database schema verification utilities.
 *
 * Verifies that the test database schema has been properly set up with all
 * required tables, extensions, and functions before running tests.
 *
 * @module
 * @category Test Setup
 */
import { Client } from "pg";

import { migrations } from "@/migrations";

const expectedMigrationNames = migrations.map((migration) => migration.name);

interface FunctionDefinitionExpectation {
  name: string;
  requiredSnippets: string[];
  forbiddenSnippets?: string[];
}

interface FunctionDefinitionRecord {
  name: string;
  definition: string;
}

const CRITICAL_FUNCTION_EXPECTATIONS: FunctionDefinitionExpectation[] = [
  {
    name: "cluster_events",
    requiredSnippets: [
      "COALESCE((p_filters->>'includePublic')::boolean, true)",
      "e.dataset_is_public = true",
      "e.catalog_owner_id = (p_filters->>'ownerId')::int",
      "ST_Intersects(e.geom, CASE WHEN p_min_lng <= p_max_lng",
    ],
    forbiddenSnippets: ["COALESCE((p_filters->>'includePublic')::boolean, false)"],
  },
  {
    name: "calculate_event_histogram",
    requiredSnippets: [
      "COALESCE((p_filters->>'includePublic')::boolean, true)",
      "e.dataset_is_public = true",
      "e.catalog_owner_id = (p_filters->>'ownerId')::int",
      "CASE WHEN (p_filters->'bounds'->>'minLng')::double precision",
    ],
    forbiddenSnippets: ["COALESCE((p_filters->>'includePublic')::boolean, false)"],
  },
  {
    name: "cluster_events_temporal",
    requiredSnippets: [
      "COALESCE((p_filters->>'includePublic')::boolean, true)",
      "e.dataset_is_public = true",
      "e.catalog_owner_id = (p_filters->>'ownerId')::int",
      "CASE WHEN (p_filters->'bounds'->>'minLng')::double precision",
    ],
    forbiddenSnippets: ["COALESCE((p_filters->>'includePublic')::boolean, false)"],
  },
];

export const findFunctionDefinitionIssues = (
  functionDefinitions: FunctionDefinitionRecord[],
  expectations: FunctionDefinitionExpectation[] = CRITICAL_FUNCTION_EXPECTATIONS
): string[] => {
  const definitionsByName = new Map(functionDefinitions.map((record) => [record.name, record.definition]));
  const issues: string[] = [];

  for (const expectation of expectations) {
    const definition = definitionsByName.get(expectation.name);
    if (!definition) {
      issues.push(`Missing required SQL function: ${expectation.name}`);
      continue;
    }

    for (const requiredSnippet of expectation.requiredSnippets) {
      if (!definition.includes(requiredSnippet)) {
        issues.push(`Function ${expectation.name} is missing expected SQL: ${requiredSnippet}`);
      }
    }

    for (const forbiddenSnippet of expectation.forbiddenSnippets ?? []) {
      if (definition.includes(forbiddenSnippet)) {
        issues.push(`Function ${expectation.name} still contains forbidden SQL: ${forbiddenSnippet}`);
      }
    }
  }

  return issues;
};

/**
 * Verifies that the database schema has been properly set up with all required tables.
 */
export const verifyDatabaseSchema = async (connectionString: string): Promise<void> => {
  const client = new Client({ connectionString });

  try {
    await client.connect();

    // Check search_path
    await client.query("SHOW search_path");

    // Check if payload schema exists
    const schemaResult = await client.query(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name = 'payload'
    `);

    if (schemaResult.rows.length === 0) {
      throw new Error("Payload schema does not exist");
    }

    // Check if critical tables exist
    const requiredTables = [
      "ingest_jobs",
      "ingest_files",
      "events",
      "catalogs",
      "datasets",
      "users",
      "media",
      "location_cache",
      "geocoding_providers",
      "views",
      "payload_migrations",
      "payload_jobs",
      "payload_jobs_log",
      "payload_locked_documents",
    ];

    for (const tableName of requiredTables) {
      const tableResult = await client.query(
        `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'payload'
        AND table_name = $1
      `,
        [tableName]
      );

      if (tableResult.rows.length === 0) {
        // Debug: check what tables exist in payload schema
        await client.query(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'payload'
          ORDER BY table_name
        `);
        throw new Error(`Required table 'payload.${tableName}' does not exist`);
      }
    }

    const appliedMigrationsResult = await client.query<{ name: string | null }>(`
      SELECT name
      FROM payload.payload_migrations
      ORDER BY name
    `);

    const appliedMigrationNames = new Set(
      appliedMigrationsResult.rows
        .map((row) => row.name)
        .filter((name): name is string => typeof name === "string" && name.length > 0)
    );

    const missingMigrations = expectedMigrationNames.filter((name) => !appliedMigrationNames.has(name));

    if (missingMigrations.length > 0) {
      throw new Error(`Database is missing migrations: ${missingMigrations.join(", ")}`);
    }

    const functionDefinitionsResult = await client.query<{ name: string; definition: string }>(
      `
      SELECT
        p.proname AS name,
        pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = ANY($1::text[])
    `,
      [CRITICAL_FUNCTION_EXPECTATIONS.map((expectation) => expectation.name)]
    );

    const functionDefinitionIssues = findFunctionDefinitionIssues(functionDefinitionsResult.rows);
    if (functionDefinitionIssues.length > 0) {
      throw new Error(
        `Critical SQL function definitions drifted from expected invariants:\n${functionDefinitionIssues.join("\n")}`
      );
    }
  } finally {
    await client.end();
  }
};
