import { type MigrateUpArgs, type MigrateDownArgs, sql } from "@payloadcms/db-postgres";

export const up = async ({ db }: MigrateUpArgs): Promise<void> => {
  await db.execute(sql`
    CREATE INDEX events_location_gist_idx
    ON "payload"."events"
    USING GIST (
      (CASE
        WHEN location_latitude IS NOT NULL AND location_longitude IS NOT NULL
        THEN
          ST_MakePoint(location_longitude, location_latitude)
        ELSE
          NULL
      END)
    );
  `);
};

export const down = async ({ db }: MigrateDownArgs): Promise<void> => {
  await db.execute(sql`
    DROP INDEX IF EXISTS events_location_gist_idx;
  `);
};
