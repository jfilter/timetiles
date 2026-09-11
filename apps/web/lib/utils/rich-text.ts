/**
 * Utilities for extracting plain text from Payload CMS Lexical rich text.
 *
 * @module
 * @category Utils
 */

import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import { convertLexicalToPlaintext } from "@payloadcms/richtext-lexical/plaintext";

/**
 * Extract plain text from a Payload CMS Lexical rich text field.
 *
 * @param richText - The rich text field value (Lexical JSON or null)
 * @param maxLength - Optional max length to truncate to
 * @returns Plain text string, or undefined if empty/null
 */
export const richTextToPlainText = (
  richText: SerializedEditorState | null | undefined,
  maxLength?: number
): string | undefined => {
  if (!richText) return undefined;

  const text = convertLexicalToPlaintext({ data: richText }).trim();
  if (!text) return undefined;

  if (maxLength && text.length > maxLength) {
    return text.slice(0, maxLength).trimEnd() + "…";
  }

  return text;
};
