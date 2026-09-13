/**
 * Validation for CMS-supplied CSS colour values.
 *
 * Accepts hex colours, colour functions with purely numeric arguments, and
 * alphabetic keywords (named colours, `transparent`). Declaration separators,
 * nested functions and `url()` are rejected, so a valid value is safe in an
 * inline `style`.
 *
 * @module
 * @category Utils
 */

const HEX_COLOR = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;
const FUNCTION_COLOR = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\((?:[\d\s.,%/+-]|deg|grad|rad|turn|none)*\)$/i;
const KEYWORD_COLOR = /^[a-z]+$/i;

/** True when `value` is a single CSS colour value that cannot carry further declarations. */
export const isCssColor = (value: string): boolean =>
  HEX_COLOR.test(value) || FUNCTION_COLOR.test(value) || KEYWORD_COLOR.test(value);
