/**
 * Rich text renderer for Payload CMS Lexical content.
 *
 * Delegates to Payload's official Lexical→React converter so every node type
 * renders correctly. The previous hand-rolled renderer matched on bespoke
 * `node.type` values (`h1`, `ul`, `li`, …) that Lexical never emits — Lexical
 * uses `{ type: "heading", tag: "h2" }`, `list`, `listitem`, `link` (with
 * `fields.url`) and per-text `format` bitflags — so headings, lists, links and
 * bold/italic formatting were silently dropped from rendered CMS content
 * (e.g. the seeded Terms/Privacy pages rendered without any of their headings).
 *
 * @module
 * @category Components
 */
import { RichText as LexicalRichText } from "@payloadcms/richtext-lexical/react";
import React from "react";

/** Editor-state shape the official converter accepts (derived from the component). */
type LexicalEditorState = Parameters<typeof LexicalRichText>[0]["data"];

interface RichTextProps {
  content: LexicalEditorState | null | undefined;
}

const PROSE_CLASS = "prose prose-lg dark:prose-invert mx-auto max-w-none";

export const RichText = ({ content }: RichTextProps) => {
  if (!content) {
    return <div />;
  }
  return <LexicalRichText className={PROSE_CLASS} data={content} />;
};
