/**
 * Defines the Payload CMS collection for individual scraper definitions.
 *
 * Each scraper belongs to a scraper-repo and defines a single entrypoint,
 * runtime, schedule, and output file. One scraper produces one CSV.
 * See ADR 0015 for full architecture.
 *
 * @category Collections
 * @module
 */
import type { CollectionConfig, Where } from "payload";

import { computeWebhookUrl, handleWebhookTokenLifecycle } from "@/lib/services/webhook-registry";

import { createCommonConfig, createOwnershipAccess, isAuthenticated, isEditorOrAdmin } from "./shared-fields";

const Scrapers: CollectionConfig = {
  slug: "scrapers",
  ...createCommonConfig({ versions: false, drafts: false }),
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "runtime", "enabled", "lastRunStatus", "updatedAt"],
    group: "Scrapers",
  },
  access: {
    // eslint-disable-next-line sonarjs/function-return-type -- Payload access control returns boolean | Where by design
    read: ({ req: { user } }): boolean | Where => {
      if (user?.role === "admin" || user?.role === "editor") return true;
      if (!user) return false;
      return { repoCreatedBy: { equals: user.id } } as Where;
    },
    create: isAuthenticated,
    update: createOwnershipAccess("scrapers", "repoCreatedBy" as "createdBy"),
    delete: isEditorOrAdmin,
    readVersions: isEditorOrAdmin,
  },
  fields: [
    { name: "name", type: "text", required: true, maxLength: 255 },
    { name: "slug", type: "text", required: true, maxLength: 255, index: true },
    // Relationship to repo
    {
      name: "repo",
      type: "relationship",
      relationTo: "scraper-repos",
      required: true,
      admin: { description: "Source code repository containing this scraper" },
    },
    // Denormalized owner for zero-query access control
    {
      name: "repoCreatedBy",
      type: "number",
      index: true,
      admin: { hidden: true, description: "Denormalized from repo.createdBy for access control" },
    },
    // Execution config
    {
      name: "runtime",
      type: "select",
      required: true,
      defaultValue: "python",
      options: [
        { label: "Python", value: "python" },
        { label: "Node.js", value: "node" },
      ],
    },
    {
      name: "entrypoint",
      type: "text",
      required: true,
      admin: { description: "Script path relative to repo root (e.g., scraper.py)" },
    },
    { name: "outputFile", type: "text", defaultValue: "data.csv", admin: { description: "Output CSV filename" } },
    // Scheduling
    {
      name: "schedule",
      type: "text",
      admin: { description: "Cron expression (e.g., 0 6 * * *). Leave empty for manual-only." },
    },
    { name: "enabled", type: "checkbox", defaultValue: true },
    // Resource limits
    {
      name: "timeoutSecs",
      type: "number",
      defaultValue: 300,
      min: 10,
      max: 3600,
      admin: { description: "Max execution time in seconds" },
    },
    {
      name: "memoryMb",
      type: "number",
      defaultValue: 512,
      min: 64,
      max: 4096,
      admin: { description: "Memory limit in MB" },
    },
    // Environment variables (encrypted)
    {
      name: "envVars",
      type: "json",
      defaultValue: {},
      admin: { description: "Environment variables passed to the scraper" },
    },
    // TimeTiles integration
    {
      name: "targetDataset",
      type: "relationship",
      relationTo: "datasets",
      admin: { description: "Dataset to import scraped data into" },
    },
    {
      name: "autoImport",
      type: "checkbox",
      defaultValue: false,
      admin: { description: "Automatically import CSV into target dataset after successful scrape" },
    },
    // Runtime stats (updated by jobs, read-only in admin)
    { name: "lastRunAt", type: "date", admin: { readOnly: true, position: "sidebar" } },
    {
      name: "lastRunStatus",
      type: "select",
      options: [
        { label: "Success", value: "success" },
        { label: "Failed", value: "failed" },
        { label: "Timeout", value: "timeout" },
        { label: "Running", value: "running" },
      ],
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "statistics",
      type: "json",
      defaultValue: { totalRuns: 0, successRuns: 0, failedRuns: 0 },
      admin: { readOnly: true },
    },
    // Next scheduled run
    { name: "nextRunAt", type: "date", admin: { readOnly: true, position: "sidebar" } },
    // Webhook trigger
    {
      name: "webhookEnabled",
      type: "checkbox",
      defaultValue: false,
      admin: { description: "Enable webhook trigger for this scraper" },
    },
    { name: "webhookToken", type: "text", maxLength: 64, index: true, admin: { hidden: true } },
    {
      name: "webhookUrl",
      type: "text",
      admin: {
        readOnly: true,
        description: "POST to this URL to trigger the scraper",
        condition: (data) => Boolean(data?.webhookEnabled && data?.webhookToken),
      },
      hooks: { afterRead: [({ data }) => computeWebhookUrl(data)] },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, originalDoc }) => {
        if (data) handleWebhookTokenLifecycle(data, originalDoc);
        return data;
      },
    ],
  },
};

export default Scrapers;
