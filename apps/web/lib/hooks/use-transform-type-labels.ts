/**
 * Translated display labels for transform types.
 *
 * `TRANSFORM_DEFINITIONS` stays the canonical registry — its English labels feed the
 * Payload admin's select options, which are not localized. Everything the wizard renders
 * goes through here instead, or step 4 shows "Rename Field" next to German copy.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { TRANSFORM_TYPES, type TransformType } from "@/lib/definitions/transform-registry";

/** Message key per transform type, in the `Ingest` namespace. */
const TRANSFORM_TYPE_MESSAGE_KEYS: Record<TransformType, string> = {
  rename: "tfTypeRename",
  "date-parse": "tfTypeDateParse",
  "string-op": "tfTypeStringOp",
  concatenate: "tfTypeConcatenate",
  split: "tfTypeSplit",
  "parse-json-array": "tfTypeParseJsonArray",
  "split-to-array": "tfTypeSplitToArray",
  extract: "tfTypeExtract",
};

/** Loosened translate function: the keys are looked up per type, not written as literals. */
type DynamicTranslate = (key: string) => string;

export const useTransformTypeLabels = (): Record<TransformType, string> => {
  const t = useTranslations("Ingest");

  return useMemo(() => {
    const translate = t as DynamicTranslate;
    return Object.fromEntries(
      TRANSFORM_TYPES.map((type) => [type, translate(TRANSFORM_TYPE_MESSAGE_KEYS[type])])
    ) as Record<TransformType, string>;
  }, [t]);
};
