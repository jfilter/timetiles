/**
 * Block registry for the page builder.
 *
 * Allows developers to register new block types without modifying core code.
 * Each block plugin provides Payload CMS field definitions. The Pages
 * collection uses `getPayloadBlocks()` to build its blocks array from
 * all registered plugins.
 *
 * @module
 * @category Blocks
 */
import type { Block as PayloadBlock } from "payload";

import { blockStyleFields } from "./block-style-fields";

/**
 * A block plugin that can be registered with the block registry.
 */
export interface BlockPlugin {
  /** Unique slug for this block type */
  slug: string;
  /** Labels for the Payload admin UI */
  labels: { singular: string; plural: string };
  /** Payload CMS field definitions for this block */
  fields: PayloadBlock["fields"];
}

const blockRegistry = new Map<string, BlockPlugin>();

/**
 * Register a block plugin with the registry.
 * Throws if a block with the same slug is already registered.
 */
export const registerBlock = (plugin: BlockPlugin): void => {
  if (blockRegistry.has(plugin.slug)) {
    throw new Error(`Block "${plugin.slug}" is already registered`);
  }
  blockRegistry.set(plugin.slug, plugin);
};

/**
 * Get all registered block plugins.
 */
export const getRegisteredBlocks = (): BlockPlugin[] => {
  return Array.from(blockRegistry.values());
};

/**
 * Get Payload CMS block definitions from all registered plugins.
 * Used by the Pages collection to build the blocks array.
 */
export const getPayloadBlocks = (): PayloadBlock[] => {
  return getRegisteredBlocks().map((plugin) => ({
    slug: plugin.slug,
    labels: plugin.labels,
    fields: [...plugin.fields, blockStyleFields],
  }));
};
