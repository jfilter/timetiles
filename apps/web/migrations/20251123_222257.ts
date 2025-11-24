import type { MigrateUpArgs, MigrateDownArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."footer" ADD COLUMN "newsletter_enabled" boolean DEFAULT true;
  ALTER TABLE "payload"."footer" ADD COLUMN "newsletter_headline" varchar DEFAULT 'Stay Mapped In';
  ALTER TABLE "payload"."footer" ADD COLUMN "newsletter_placeholder" varchar DEFAULT 'your@email.address';
  ALTER TABLE "payload"."footer" ADD COLUMN "newsletter_button_text" varchar DEFAULT 'Subscribe';
  ALTER TABLE "payload"."_footer_v" ADD COLUMN "version_newsletter_enabled" boolean DEFAULT true;
  ALTER TABLE "payload"."_footer_v" ADD COLUMN "version_newsletter_headline" varchar DEFAULT 'Stay Mapped In';
  ALTER TABLE "payload"."_footer_v" ADD COLUMN "version_newsletter_placeholder" varchar DEFAULT 'your@email.address';
  ALTER TABLE "payload"."_footer_v" ADD COLUMN "version_newsletter_button_text" varchar DEFAULT 'Subscribe';`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."footer" DROP COLUMN "newsletter_enabled";
  ALTER TABLE "payload"."footer" DROP COLUMN "newsletter_headline";
  ALTER TABLE "payload"."footer" DROP COLUMN "newsletter_placeholder";
  ALTER TABLE "payload"."footer" DROP COLUMN "newsletter_button_text";
  ALTER TABLE "payload"."_footer_v" DROP COLUMN "version_newsletter_enabled";
  ALTER TABLE "payload"."_footer_v" DROP COLUMN "version_newsletter_headline";
  ALTER TABLE "payload"."_footer_v" DROP COLUMN "version_newsletter_placeholder";
  ALTER TABLE "payload"."_footer_v" DROP COLUMN "version_newsletter_button_text";`);
}
