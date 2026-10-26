import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE INDEX "pages_blocks_hero_buttons_locales_parent_id_idx" ON "payload"."pages_blocks_hero_buttons_locales" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_hero_locales_parent_id_idx" ON "payload"."pages_blocks_hero_locales" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_features_features_locales_parent_id_idx" ON "payload"."pages_blocks_features_features_locales" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_features_locales_parent_id_idx" ON "payload"."pages_blocks_features_locales" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_stats_stats_locales_parent_id_idx" ON "payload"."pages_blocks_stats_stats_locales" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_details_grid_items_locales_parent_id_idx" ON "payload"."pages_blocks_details_grid_items_locales" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_details_grid_locales_parent_id_idx" ON "payload"."pages_blocks_details_grid_locales" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_timeline_items_locales_parent_id_idx" ON "payload"."pages_blocks_timeline_items_locales" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_timeline_locales_parent_id_idx" ON "payload"."pages_blocks_timeline_locales" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_testimonials_items_locales_parent_id_idx" ON "payload"."pages_blocks_testimonials_items_locales" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_testimonials_locales_parent_id_idx" ON "payload"."pages_blocks_testimonials_locales" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_rich_text_locales_parent_id_idx" ON "payload"."pages_blocks_rich_text_locales" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_cta_locales_parent_id_idx" ON "payload"."pages_blocks_cta_locales" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_newsletter_form_locales_parent_id_idx" ON "payload"."pages_blocks_newsletter_form_locales" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_newsletter_c_t_a_locales_parent_id_idx" ON "payload"."pages_blocks_newsletter_c_t_a_locales" USING btree ("_parent_id");
  CREATE INDEX "pages_locales_parent_id_idx" ON "payload"."pages_locales" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_hero_buttons_locales_parent_id_idx" ON "payload"."_pages_v_blocks_hero_buttons_locales" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_hero_locales_parent_id_idx" ON "payload"."_pages_v_blocks_hero_locales" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_features_features_locales_parent_id_idx" ON "payload"."_pages_v_blocks_features_features_locales" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_features_locales_parent_id_idx" ON "payload"."_pages_v_blocks_features_locales" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_stats_stats_locales_parent_id_idx" ON "payload"."_pages_v_blocks_stats_stats_locales" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_details_grid_items_locales_parent_id_idx" ON "payload"."_pages_v_blocks_details_grid_items_locales" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_details_grid_locales_parent_id_idx" ON "payload"."_pages_v_blocks_details_grid_locales" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_timeline_items_locales_parent_id_idx" ON "payload"."_pages_v_blocks_timeline_items_locales" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_timeline_locales_parent_id_idx" ON "payload"."_pages_v_blocks_timeline_locales" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_testimonials_items_locales_parent_id_idx" ON "payload"."_pages_v_blocks_testimonials_items_locales" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_testimonials_locales_parent_id_idx" ON "payload"."_pages_v_blocks_testimonials_locales" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_rich_text_locales_parent_id_idx" ON "payload"."_pages_v_blocks_rich_text_locales" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_cta_locales_parent_id_idx" ON "payload"."_pages_v_blocks_cta_locales" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_newsletter_form_locales_parent_id_idx" ON "payload"."_pages_v_blocks_newsletter_form_locales" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_newsletter_c_t_a_locales_parent_id_idx" ON "payload"."_pages_v_blocks_newsletter_c_t_a_locales" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_locales_parent_id_idx" ON "payload"."_pages_v_locales" USING btree ("_parent_id");
  CREATE INDEX "main_menu_nav_items_locales_parent_id_idx" ON "payload"."main_menu_nav_items_locales" USING btree ("_parent_id");
  CREATE INDEX "_main_menu_v_version_nav_items_locales_parent_id_idx" ON "payload"."_main_menu_v_version_nav_items_locales" USING btree ("_parent_id");
  CREATE INDEX "footer_columns_links_locales_parent_id_idx" ON "payload"."footer_columns_links_locales" USING btree ("_parent_id");
  CREATE INDEX "footer_columns_locales_parent_id_idx" ON "payload"."footer_columns_locales" USING btree ("_parent_id");
  CREATE INDEX "footer_locales_parent_id_idx" ON "payload"."footer_locales" USING btree ("_parent_id");
  CREATE INDEX "_footer_v_version_columns_links_locales_parent_id_idx" ON "payload"."_footer_v_version_columns_links_locales" USING btree ("_parent_id");
  CREATE INDEX "_footer_v_version_columns_locales_parent_id_idx" ON "payload"."_footer_v_version_columns_locales" USING btree ("_parent_id");
  CREATE INDEX "_footer_v_locales_parent_id_idx" ON "payload"."_footer_v_locales" USING btree ("_parent_id");
  CREATE INDEX "branding_locales_parent_id_idx" ON "payload"."branding_locales" USING btree ("_parent_id");
  CREATE INDEX "settings_locales_parent_id_idx" ON "payload"."settings_locales" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."pages_blocks_hero_buttons_locales_parent_id_idx";
  DROP INDEX "payload"."pages_blocks_hero_locales_parent_id_idx";
  DROP INDEX "payload"."pages_blocks_features_features_locales_parent_id_idx";
  DROP INDEX "payload"."pages_blocks_features_locales_parent_id_idx";
  DROP INDEX "payload"."pages_blocks_stats_stats_locales_parent_id_idx";
  DROP INDEX "payload"."pages_blocks_details_grid_items_locales_parent_id_idx";
  DROP INDEX "payload"."pages_blocks_details_grid_locales_parent_id_idx";
  DROP INDEX "payload"."pages_blocks_timeline_items_locales_parent_id_idx";
  DROP INDEX "payload"."pages_blocks_timeline_locales_parent_id_idx";
  DROP INDEX "payload"."pages_blocks_testimonials_items_locales_parent_id_idx";
  DROP INDEX "payload"."pages_blocks_testimonials_locales_parent_id_idx";
  DROP INDEX "payload"."pages_blocks_rich_text_locales_parent_id_idx";
  DROP INDEX "payload"."pages_blocks_cta_locales_parent_id_idx";
  DROP INDEX "payload"."pages_blocks_newsletter_form_locales_parent_id_idx";
  DROP INDEX "payload"."pages_blocks_newsletter_c_t_a_locales_parent_id_idx";
  DROP INDEX "payload"."pages_locales_parent_id_idx";
  DROP INDEX "payload"."_pages_v_blocks_hero_buttons_locales_parent_id_idx";
  DROP INDEX "payload"."_pages_v_blocks_hero_locales_parent_id_idx";
  DROP INDEX "payload"."_pages_v_blocks_features_features_locales_parent_id_idx";
  DROP INDEX "payload"."_pages_v_blocks_features_locales_parent_id_idx";
  DROP INDEX "payload"."_pages_v_blocks_stats_stats_locales_parent_id_idx";
  DROP INDEX "payload"."_pages_v_blocks_details_grid_items_locales_parent_id_idx";
  DROP INDEX "payload"."_pages_v_blocks_details_grid_locales_parent_id_idx";
  DROP INDEX "payload"."_pages_v_blocks_timeline_items_locales_parent_id_idx";
  DROP INDEX "payload"."_pages_v_blocks_timeline_locales_parent_id_idx";
  DROP INDEX "payload"."_pages_v_blocks_testimonials_items_locales_parent_id_idx";
  DROP INDEX "payload"."_pages_v_blocks_testimonials_locales_parent_id_idx";
  DROP INDEX "payload"."_pages_v_blocks_rich_text_locales_parent_id_idx";
  DROP INDEX "payload"."_pages_v_blocks_cta_locales_parent_id_idx";
  DROP INDEX "payload"."_pages_v_blocks_newsletter_form_locales_parent_id_idx";
  DROP INDEX "payload"."_pages_v_blocks_newsletter_c_t_a_locales_parent_id_idx";
  DROP INDEX "payload"."_pages_v_locales_parent_id_idx";
  DROP INDEX "payload"."main_menu_nav_items_locales_parent_id_idx";
  DROP INDEX "payload"."_main_menu_v_version_nav_items_locales_parent_id_idx";
  DROP INDEX "payload"."footer_columns_links_locales_parent_id_idx";
  DROP INDEX "payload"."footer_columns_locales_parent_id_idx";
  DROP INDEX "payload"."footer_locales_parent_id_idx";
  DROP INDEX "payload"."_footer_v_version_columns_links_locales_parent_id_idx";
  DROP INDEX "payload"."_footer_v_version_columns_locales_parent_id_idx";
  DROP INDEX "payload"."_footer_v_locales_parent_id_idx";
  DROP INDEX "payload"."branding_locales_parent_id_idx";
  DROP INDEX "payload"."settings_locales_parent_id_idx";`)
}
