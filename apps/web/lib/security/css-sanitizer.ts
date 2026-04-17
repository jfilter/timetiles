/**
 * AST-based sanitizer for user-provided custom CSS.
 *
 * Per ADR 0038: parse incoming CSS with PostCSS, drop rules, declarations,
 * and at-rules that don't fit an allowlist, and serialize the cleaned tree
 * back out. Replaces the previous regex-based stripper which was too easy
 * to bypass with whitespace and escape-sequence variations.
 *
 * This sanitizer is a safety net for an admin-only feature; the primary
 * theming path is the structured Branding/tokens system. We stay on the
 * conservative side: when in doubt, drop.
 *
 * @module
 * @category Security
 */
import { type Container, type Declaration } from "postcss";
import safeParser from "postcss-safe-parser";

/** At-rules we are willing to emit. Everything else is dropped. */
const ALLOWED_AT_RULES = new Set(["media", "supports"]);

/**
 * Declarations whose property is forbidden outright. These either execute
 * code, enable full-page overlay / fingerprinting attacks, or have no
 * legitimate use inside a user-scoped stylesheet.
 */
const FORBIDDEN_PROPERTIES = new Set(["behavior", "-moz-binding", "-webkit-binding", "binding"]);

/**
 * CSS functions that can load external resources or read DOM state.
 * Declarations containing any of these are dropped regardless of property.
 *
 * `url()` is blocked because @font-face / background-image / list-style
 * can all smuggle network requests or fingerprinting probes.
 *
 * `attr()` is blocked because `content: attr(x)` exfiltrates DOM attrs.
 *
 * `expression()` is legacy IE JS execution.
 *
 * `image-set()` is not itself dangerous but it takes url() arguments, so
 * treat it the same as url() for safety.
 */
const DANGEROUS_FN_PATTERN = /\b(url|attr|expression|image-set|-moz-binding|-webkit-binding|binding)\s*\(/i;

/**
 * Values we refuse to accept for specific properties. Used to block
 * `position: fixed` / `sticky` overlay attacks while still permitting
 * relative/absolute/static layout.
 */
const FORBIDDEN_VALUES_BY_PROPERTY: Record<string, RegExp> = { position: /\b(fixed|sticky)\b/i };

/** Normalize property name: lower-case, keep vendor prefix as-is. */
const normalizeProp = (prop: string): string => prop.trim().toLowerCase();

const isForbiddenDeclaration = (decl: Declaration): boolean => {
  const prop = normalizeProp(decl.prop);
  if (FORBIDDEN_PROPERTIES.has(prop)) return true;

  const valuePattern = FORBIDDEN_VALUES_BY_PROPERTY[prop];
  if (valuePattern?.test(decl.value)) return true;

  if (DANGEROUS_FN_PATTERN.test(decl.value)) return true;

  // javascript:/expression: schemes in values
  if (/(javascript|expression)\s*:/i.test(decl.value)) return true;

  // Reject any backslash-encoded escapes — attackers use them to smuggle
  // keywords like `j\61 vascript` past string filters, and we have no
  // legitimate need for them in an admin-scoped stylesheet.
  if (/\\[0-9a-f]/i.test(decl.value)) return true;

  return false;
};

/** Walk a container, drop forbidden nodes, recurse into conditional at-rules. */
const sanitizeContainer = (container: Container): void => {
  container.each((node) => {
    if (node.type === "decl") {
      if (isForbiddenDeclaration(node)) node.remove();
      return;
    }

    if (node.type === "atrule") {
      const name = node.name.toLowerCase();
      if (!ALLOWED_AT_RULES.has(name)) {
        node.remove();
        return;
      }
      // media / supports: recurse into their inner rules.
      sanitizeContainer(node);
      if (node.nodes?.length === 0) node.remove();
      return;
    }

    if (node.type === "rule") {
      sanitizeContainer(node);
      if (node.nodes?.length === 0) node.remove();
      return;
    }

    // Comments pass through; anything else we didn't recognize is dropped.
    const nodeType = (node as { type: string }).type;
    if (nodeType !== "comment") (node as { remove: () => void }).remove();
  });
};

/**
 * Sanitize a block of user-supplied CSS.
 *
 * Returns the cleaned CSS. Returns an empty string if parsing fails so
 * malformed input can never reach the rendered page.
 */
export const sanitizeCSS = (css: string): string => {
  if (typeof css !== "string" || css.length === 0) return "";

  try {
    const root = safeParser(css);
    // postcss-safe-parser stashes unparseable prelude/trailing bytes on
    // root.raws (before/after) and echoes them out on toString(). That
    // means stray HTML such as `</style><script>...` would come back
    // untouched. Drop the raws so only properly parsed nodes survive.
    root.raws.before = "";
    root.raws.after = "";
    sanitizeContainer(root);
    return root.toString();
  } catch {
    return "";
  }
};
