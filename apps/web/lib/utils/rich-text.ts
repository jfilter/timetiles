/**
 * Utilities for extracting plain text from Payload CMS Lexical rich text.
 *
 * @module
 * @category Utils
 */

interface LexicalNode {
  type?: string;
  text?: string;
  children?: LexicalNode[];
}

interface LexicalRoot {
  root?: LexicalNode;
}

/** Recursively extract text content from a Lexical node tree. */
const extractNodeText = (node: LexicalNode): string => {
  if (node.text) return node.text;
  if (!node.children) return "";
  return node.children.map(extractNodeText).join(" ");
};

/**
 * Extract plain text from a Payload CMS Lexical rich text field.
 *
 * @param richText - The rich text field value (Lexical JSON or null)
 * @param maxLength - Optional max length to truncate to
 * @returns Plain text string, or undefined if empty/null
 */
export const richTextToPlainText = (
  richText: LexicalRoot | null | undefined,
  maxLength?: number
): string | undefined => {
  if (!richText?.root?.children) return undefined;

  const text = extractNodeText(richText.root).trim();
  if (!text) return undefined;

  if (maxLength && text.length > maxLength) {
    return text.slice(0, maxLength).trimEnd() + "…";
  }

  return text;
};
