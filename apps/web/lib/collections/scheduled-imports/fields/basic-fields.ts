/**
 * Basic field definitions for scheduled imports.
 *
 * @module
 * @category Collections
 */

import type { Field } from "payload";

import { validateUrl } from "../validation";

export const basicFields: Field[] = [
  {
    name: "name",
    type: "text",
    required: true,
    admin: {
      description: "Descriptive name for this scheduled import",
    },
  },
  {
    name: "createdBy",
    type: "relationship",
    relationTo: "users",
    required: true,
    admin: {
      position: "sidebar",
      readOnly: true,
      description: "User who created this scheduled import",
    },
  },
  {
    name: "description",
    type: "textarea",
    admin: {
      description: "Optional description of what this import does",
    },
  },
  {
    name: "enabled",
    type: "checkbox",
    defaultValue: true,
    admin: {
      position: "sidebar",
      description: "Enable/disable this scheduled import",
    },
  },
  {
    name: "sourceUrl",
    type: "text",
    label: "Source URL",
    required: true,
    validate: validateUrl,
    admin: {
      description: "URL to fetch data from",
    },
  },
];
