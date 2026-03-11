import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ============================================================
  // 1. Create enums for sites and _sites_v
  // ============================================================
  await db.execute(sql`
    CREATE TYPE "payload"."enum_sites_status" AS ENUM('draft', 'published');
    CREATE TYPE "payload"."enum__sites_v_version_status" AS ENUM('draft', 'published');
  `)

  // ============================================================
  // 2. Create sites table
  // ============================================================
  await db.execute(sql`
    CREATE TABLE "payload"."sites" (
      "id" serial PRIMARY KEY NOT NULL,
      "name" varchar,
      "slug" varchar,
      "domain" varchar,
      "is_default" boolean DEFAULT false,
      "branding_title" varchar,
      "branding_logo_id" integer,
      "branding_logo_dark_id" integer,
      "branding_favicon_id" integer,
      "branding_colors_primary" varchar,
      "branding_colors_secondary" varchar,
      "branding_colors_background" varchar,
      "branding_header_html" varchar,
      "is_public" boolean DEFAULT true,
      "created_by_id" integer,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "deleted_at" timestamp(3) with time zone,
      "_status" "payload"."enum_sites_status" DEFAULT 'draft'
    );
  `)

  // ============================================================
  // 3. Create _sites_v versioned table
  // ============================================================
  await db.execute(sql`
    CREATE TABLE "payload"."_sites_v" (
      "id" serial PRIMARY KEY NOT NULL,
      "parent_id" integer,
      "version_name" varchar,
      "version_slug" varchar,
      "version_domain" varchar,
      "version_is_default" boolean DEFAULT false,
      "version_branding_title" varchar,
      "version_branding_logo_id" integer,
      "version_branding_logo_dark_id" integer,
      "version_branding_favicon_id" integer,
      "version_branding_colors_primary" varchar,
      "version_branding_colors_secondary" varchar,
      "version_branding_colors_background" varchar,
      "version_branding_header_html" varchar,
      "version_is_public" boolean DEFAULT true,
      "version_created_by_id" integer,
      "version_updated_at" timestamp(3) with time zone,
      "version_created_at" timestamp(3) with time zone,
      "version_deleted_at" timestamp(3) with time zone,
      "version__status" "payload"."enum__sites_v_version_status" DEFAULT 'draft',
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "latest" boolean,
      "autosave" boolean
    );
  `)

  // ============================================================
  // 4. Sites table: indexes
  // ============================================================
  await db.execute(sql`
    CREATE UNIQUE INDEX "sites_slug_idx" ON "payload"."sites" USING btree ("slug");
    CREATE UNIQUE INDEX "sites_domain_idx" ON "payload"."sites" USING btree ("domain");
    CREATE INDEX "sites_branding_branding_logo_idx" ON "payload"."sites" USING btree ("branding_logo_id");
    CREATE INDEX "sites_branding_branding_logo_dark_idx" ON "payload"."sites" USING btree ("branding_logo_dark_id");
    CREATE INDEX "sites_branding_branding_favicon_idx" ON "payload"."sites" USING btree ("branding_favicon_id");
    CREATE INDEX "sites_created_by_idx" ON "payload"."sites" USING btree ("created_by_id");
    CREATE INDEX "sites_updated_at_idx" ON "payload"."sites" USING btree ("updated_at");
    CREATE INDEX "sites_created_at_idx" ON "payload"."sites" USING btree ("created_at");
    CREATE INDEX "sites_deleted_at_idx" ON "payload"."sites" USING btree ("deleted_at");
    CREATE INDEX "sites__status_idx" ON "payload"."sites" USING btree ("_status");
  `)

  // ============================================================
  // 5. Sites table: foreign keys
  // ============================================================
  await db.execute(sql`
    ALTER TABLE "payload"."sites" ADD CONSTRAINT "sites_branding_logo_id_media_id_fk" FOREIGN KEY ("branding_logo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "payload"."sites" ADD CONSTRAINT "sites_branding_logo_dark_id_media_id_fk" FOREIGN KEY ("branding_logo_dark_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "payload"."sites" ADD CONSTRAINT "sites_branding_favicon_id_media_id_fk" FOREIGN KEY ("branding_favicon_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "payload"."sites" ADD CONSTRAINT "sites_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  `)

  // ============================================================
  // 6. _sites_v table: indexes
  // ============================================================
  await db.execute(sql`
    CREATE INDEX "_sites_v_parent_idx" ON "payload"."_sites_v" USING btree ("parent_id");
    CREATE INDEX "_sites_v_version_version_slug_idx" ON "payload"."_sites_v" USING btree ("version_slug");
    CREATE INDEX "_sites_v_version_version_domain_idx" ON "payload"."_sites_v" USING btree ("version_domain");
    CREATE INDEX "_sites_v_version_branding_version_branding_logo_idx" ON "payload"."_sites_v" USING btree ("version_branding_logo_id");
    CREATE INDEX "_sites_v_version_branding_version_branding_logo_dark_idx" ON "payload"."_sites_v" USING btree ("version_branding_logo_dark_id");
    CREATE INDEX "_sites_v_version_branding_version_branding_favicon_idx" ON "payload"."_sites_v" USING btree ("version_branding_favicon_id");
    CREATE INDEX "_sites_v_version_version_created_by_idx" ON "payload"."_sites_v" USING btree ("version_created_by_id");
    CREATE INDEX "_sites_v_version_version_updated_at_idx" ON "payload"."_sites_v" USING btree ("version_updated_at");
    CREATE INDEX "_sites_v_version_version_created_at_idx" ON "payload"."_sites_v" USING btree ("version_created_at");
    CREATE INDEX "_sites_v_version_version_deleted_at_idx" ON "payload"."_sites_v" USING btree ("version_deleted_at");
    CREATE INDEX "_sites_v_version_version__status_idx" ON "payload"."_sites_v" USING btree ("version__status");
    CREATE INDEX "_sites_v_created_at_idx" ON "payload"."_sites_v" USING btree ("created_at");
    CREATE INDEX "_sites_v_updated_at_idx" ON "payload"."_sites_v" USING btree ("updated_at");
    CREATE INDEX "_sites_v_latest_idx" ON "payload"."_sites_v" USING btree ("latest");
    CREATE INDEX "_sites_v_autosave_idx" ON "payload"."_sites_v" USING btree ("autosave");
  `)

  // ============================================================
  // 7. _sites_v table: foreign keys
  // ============================================================
  await db.execute(sql`
    ALTER TABLE "payload"."_sites_v" ADD CONSTRAINT "_sites_v_parent_id_sites_id_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."sites"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "payload"."_sites_v" ADD CONSTRAINT "_sites_v_version_branding_logo_id_media_id_fk" FOREIGN KEY ("version_branding_logo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "payload"."_sites_v" ADD CONSTRAINT "_sites_v_version_branding_logo_dark_id_media_id_fk" FOREIGN KEY ("version_branding_logo_dark_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "payload"."_sites_v" ADD CONSTRAINT "_sites_v_version_branding_favicon_id_media_id_fk" FOREIGN KEY ("version_branding_favicon_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "payload"."_sites_v" ADD CONSTRAINT "_sites_v_version_created_by_id_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "payload"."users"("id") ON DELETE set null ON UPDATE no action;
  `)

  // ============================================================
  // 8. Add sites to payload_locked_documents_rels
  // ============================================================
  await db.execute(sql`
    ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "sites_id" integer;
    ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sites_fk" FOREIGN KEY ("sites_id") REFERENCES "payload"."sites"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX "payload_locked_documents_rels_sites_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("sites_id");
  `)

  // ============================================================
  // 9. Refactor views: drop branding FK constraints first
  // ============================================================
  await db.execute(sql`
    ALTER TABLE "payload"."views" DROP CONSTRAINT IF EXISTS "views_branding_logo_id_media_id_fk";
    ALTER TABLE "payload"."views" DROP CONSTRAINT IF EXISTS "views_branding_favicon_id_media_id_fk";
    ALTER TABLE "payload"."_views_v" DROP CONSTRAINT IF EXISTS "_views_v_version_branding_logo_id_media_id_fk";
    ALTER TABLE "payload"."_views_v" DROP CONSTRAINT IF EXISTS "_views_v_version_branding_favicon_id_media_id_fk";
  `)

  // ============================================================
  // 10. Refactor views: drop branding indexes
  // ============================================================
  await db.execute(sql`
    DROP INDEX IF EXISTS "payload"."views_branding_branding_domain_idx";
    DROP INDEX IF EXISTS "payload"."views_branding_branding_logo_idx";
    DROP INDEX IF EXISTS "payload"."views_branding_branding_favicon_idx";
    DROP INDEX IF EXISTS "payload"."_views_v_version_branding_version_branding_domain_idx";
    DROP INDEX IF EXISTS "payload"."_views_v_version_branding_version_branding_logo_idx";
    DROP INDEX IF EXISTS "payload"."_views_v_version_branding_version_branding_favicon_idx";
  `)

  // ============================================================
  // 11. Refactor views: drop branding columns from views table
  // ============================================================
  await db.execute(sql`
    ALTER TABLE "payload"."views" DROP COLUMN IF EXISTS "branding_domain";
    ALTER TABLE "payload"."views" DROP COLUMN IF EXISTS "branding_title";
    ALTER TABLE "payload"."views" DROP COLUMN IF EXISTS "branding_logo_id";
    ALTER TABLE "payload"."views" DROP COLUMN IF EXISTS "branding_favicon_id";
    ALTER TABLE "payload"."views" DROP COLUMN IF EXISTS "branding_colors_primary";
    ALTER TABLE "payload"."views" DROP COLUMN IF EXISTS "branding_colors_secondary";
    ALTER TABLE "payload"."views" DROP COLUMN IF EXISTS "branding_colors_background";
    ALTER TABLE "payload"."views" DROP COLUMN IF EXISTS "branding_header_html";
  `)

  // ============================================================
  // 12. Refactor views: drop branding columns from _views_v table
  // ============================================================
  await db.execute(sql`
    ALTER TABLE "payload"."_views_v" DROP COLUMN IF EXISTS "version_branding_domain";
    ALTER TABLE "payload"."_views_v" DROP COLUMN IF EXISTS "version_branding_title";
    ALTER TABLE "payload"."_views_v" DROP COLUMN IF EXISTS "version_branding_logo_id";
    ALTER TABLE "payload"."_views_v" DROP COLUMN IF EXISTS "version_branding_favicon_id";
    ALTER TABLE "payload"."_views_v" DROP COLUMN IF EXISTS "version_branding_colors_primary";
    ALTER TABLE "payload"."_views_v" DROP COLUMN IF EXISTS "version_branding_colors_secondary";
    ALTER TABLE "payload"."_views_v" DROP COLUMN IF EXISTS "version_branding_colors_background";
    ALTER TABLE "payload"."_views_v" DROP COLUMN IF EXISTS "version_branding_header_html";
  `)

  // ============================================================
  // 13. Refactor views: add site_id relationship column
  // ============================================================
  await db.execute(sql`
    ALTER TABLE "payload"."views" ADD COLUMN "site_id" integer;
    ALTER TABLE "payload"."views" ADD CONSTRAINT "views_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "payload"."sites"("id") ON DELETE set null ON UPDATE no action;
    CREATE INDEX "views_site_idx" ON "payload"."views" USING btree ("site_id");
  `)

  // ============================================================
  // 14. Refactor _views_v: add version_site_id relationship column
  // ============================================================
  await db.execute(sql`
    ALTER TABLE "payload"."_views_v" ADD COLUMN "version_site_id" integer;
    ALTER TABLE "payload"."_views_v" ADD CONSTRAINT "_views_v_version_site_id_sites_id_fk" FOREIGN KEY ("version_site_id") REFERENCES "payload"."sites"("id") ON DELETE set null ON UPDATE no action;
    CREATE INDEX "_views_v_version_version_site_idx" ON "payload"."_views_v" USING btree ("version_site_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // ============================================================
  // 1. Remove site_id from _views_v
  // ============================================================
  await db.execute(sql`
    ALTER TABLE "payload"."_views_v" DROP CONSTRAINT IF EXISTS "_views_v_version_site_id_sites_id_fk";
    DROP INDEX IF EXISTS "payload"."_views_v_version_version_site_idx";
    ALTER TABLE "payload"."_views_v" DROP COLUMN IF EXISTS "version_site_id";
  `)

  // ============================================================
  // 2. Remove site_id from views
  // ============================================================
  await db.execute(sql`
    ALTER TABLE "payload"."views" DROP CONSTRAINT IF EXISTS "views_site_id_sites_id_fk";
    DROP INDEX IF EXISTS "payload"."views_site_idx";
    ALTER TABLE "payload"."views" DROP COLUMN IF EXISTS "site_id";
  `)

  // ============================================================
  // 3. Restore branding columns on _views_v
  // ============================================================
  await db.execute(sql`
    ALTER TABLE "payload"."_views_v" ADD COLUMN "version_branding_domain" varchar;
    ALTER TABLE "payload"."_views_v" ADD COLUMN "version_branding_title" varchar;
    ALTER TABLE "payload"."_views_v" ADD COLUMN "version_branding_logo_id" integer;
    ALTER TABLE "payload"."_views_v" ADD COLUMN "version_branding_favicon_id" integer;
    ALTER TABLE "payload"."_views_v" ADD COLUMN "version_branding_colors_primary" varchar;
    ALTER TABLE "payload"."_views_v" ADD COLUMN "version_branding_colors_secondary" varchar;
    ALTER TABLE "payload"."_views_v" ADD COLUMN "version_branding_colors_background" varchar;
    ALTER TABLE "payload"."_views_v" ADD COLUMN "version_branding_header_html" varchar;
  `)

  // ============================================================
  // 4. Restore branding columns on views
  // ============================================================
  await db.execute(sql`
    ALTER TABLE "payload"."views" ADD COLUMN "branding_domain" varchar;
    ALTER TABLE "payload"."views" ADD COLUMN "branding_title" varchar;
    ALTER TABLE "payload"."views" ADD COLUMN "branding_logo_id" integer;
    ALTER TABLE "payload"."views" ADD COLUMN "branding_favicon_id" integer;
    ALTER TABLE "payload"."views" ADD COLUMN "branding_colors_primary" varchar;
    ALTER TABLE "payload"."views" ADD COLUMN "branding_colors_secondary" varchar;
    ALTER TABLE "payload"."views" ADD COLUMN "branding_colors_background" varchar;
    ALTER TABLE "payload"."views" ADD COLUMN "branding_header_html" varchar;
  `)

  // ============================================================
  // 5. Restore branding indexes on views
  // ============================================================
  await db.execute(sql`
    CREATE UNIQUE INDEX "views_branding_branding_domain_idx" ON "payload"."views" USING btree ("branding_domain");
    CREATE INDEX "views_branding_branding_logo_idx" ON "payload"."views" USING btree ("branding_logo_id");
    CREATE INDEX "views_branding_branding_favicon_idx" ON "payload"."views" USING btree ("branding_favicon_id");
    CREATE INDEX "_views_v_version_branding_version_branding_domain_idx" ON "payload"."_views_v" USING btree ("version_branding_domain");
    CREATE INDEX "_views_v_version_branding_version_branding_logo_idx" ON "payload"."_views_v" USING btree ("version_branding_logo_id");
    CREATE INDEX "_views_v_version_branding_version_branding_favicon_idx" ON "payload"."_views_v" USING btree ("version_branding_favicon_id");
  `)

  // ============================================================
  // 6. Restore branding FK constraints on views
  // ============================================================
  await db.execute(sql`
    ALTER TABLE "payload"."views" ADD CONSTRAINT "views_branding_logo_id_media_id_fk" FOREIGN KEY ("branding_logo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "payload"."views" ADD CONSTRAINT "views_branding_favicon_id_media_id_fk" FOREIGN KEY ("branding_favicon_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "payload"."_views_v" ADD CONSTRAINT "_views_v_version_branding_logo_id_media_id_fk" FOREIGN KEY ("version_branding_logo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "payload"."_views_v" ADD CONSTRAINT "_views_v_version_branding_favicon_id_media_id_fk" FOREIGN KEY ("version_branding_favicon_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  `)

  // ============================================================
  // 7. Remove sites from payload_locked_documents_rels
  // ============================================================
  await db.execute(sql`
    ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_sites_fk";
    DROP INDEX IF EXISTS "payload"."payload_locked_documents_rels_sites_id_idx";
    ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN IF EXISTS "sites_id";
  `)

  // ============================================================
  // 8. Drop _sites_v table
  // ============================================================
  await db.execute(sql`
    ALTER TABLE "payload"."_sites_v" DISABLE ROW LEVEL SECURITY;
    DROP TABLE "payload"."_sites_v" CASCADE;
  `)

  // ============================================================
  // 9. Drop sites table
  // ============================================================
  await db.execute(sql`
    ALTER TABLE "payload"."sites" DISABLE ROW LEVEL SECURITY;
    DROP TABLE "payload"."sites" CASCADE;
  `)

  // ============================================================
  // 10. Drop sites enums
  // ============================================================
  await db.execute(sql`
    DROP TYPE "payload"."enum_sites_status";
    DROP TYPE "payload"."enum__sites_v_version_status";
  `)
}
