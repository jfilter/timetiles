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

interface RichTextNode {
  type?: string;
  children?: RichTextNode[];
  [key: string]: unknown;
}

interface RootContent {
  root: { children: RichTextNode[] };
}

interface RichTextProps {
  content: RootContent | RichTextNode[] | null | undefined;
}

const PROSE_CLASS = "prose prose-lg dark:prose-invert mx-auto max-w-none";

/**
 * Coerce the shapes callers pass — a full Lexical editor state (`{ root }`) or a
 * legacy bare children array — into the editor state the converter expects.
 * Returns null when there is nothing renderable.
 */
const toEditorState = (content: RichTextProps["content"]): LexicalEditorState | null => {
  if (!content) return null;

  if (typeof content === "object" && "root" in content && content.root?.children != null) {
    return content as unknown as LexicalEditorState;
  }

  if (Array.isArray(content)) {
    return {
      root: { type: "root", children: content, direction: null, format: "", indent: 0, version: 1 },
    } as unknown as LexicalEditorState;
  }

  return null;
};

export const RichText = ({ content }: RichTextProps) => {
  const data = toEditorState(content);
  if (!data) {
    return <div />;
  }
  return <LexicalRichText className={PROSE_CLASS} data={data} />;
};
