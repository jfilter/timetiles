/**
 * Safe date parsing helpers for untrusted import data only.
 *
 * JavaScript's Date parser accepts surprising inputs such as numeric strings
 * ("39135" becomes a far-future year). Import data can contain identifiers,
 * census values, and other numeric-looking strings, so this module keeps the
 * accepted surface explicit and shared across the ingest path.
 *
 * @module
 * @category Utils
 */

export type ImportDateInput = string | number | Date | null | undefined;

type DatePart = "D" | "M" | "Y";

interface DateFormatPattern {
  separator: string;
  order: readonly [DatePart, DatePart, DatePart];
}

const ISO_DATE_PREFIX_REGEX = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/;
const UNIX_SECONDS_MIN = 1_000_000_000;
const UNIX_SECONDS_MAX = 9_999_999_999;
const UNIX_MILLISECONDS_MIN = 1_000_000_000_000;
const UNIX_MILLISECONDS_MAX = 9_999_999_999_999;

const FORMAT_PATTERNS: Record<string, DateFormatPattern> = {
  "DD/MM/YYYY": { order: ["D", "M", "Y"], separator: "/" },
  "MM/DD/YYYY": { order: ["M", "D", "Y"], separator: "/" },
  "YYYY-MM-DD": { order: ["Y", "M", "D"], separator: "-" },
  "DD-MM-YYYY": { order: ["D", "M", "Y"], separator: "-" },
  "MM-DD-YYYY": { order: ["M", "D", "Y"], separator: "-" },
  "DD.MM.YYYY": { order: ["D", "M", "Y"], separator: "." },
  "YYYY/MM/DD": { order: ["Y", "M", "D"], separator: "/" },
};

const MONTH_NAMES: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const DAYS_BY_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/**
 * Check if a Date object is valid.
 */
export const isValidDate = (date: Date): boolean => !Number.isNaN(date.getTime());

const isLeapYear = (year: number): boolean => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const isValidCalendarDate = (year: number, month: number, day: number): boolean => {
  if (month < 1 || month > 12) return false;
  const maxDay = month === 2 && isLeapYear(year) ? 29 : DAYS_BY_MONTH[month - 1];
  return day >= 1 && day <= (maxDay ?? 0);
};

export const hasInvalidIsoDatePart = (date: string): boolean => {
  const match = ISO_DATE_PREFIX_REGEX.exec(date);
  if (!match?.[1] || !match[2] || !match[3]) {
    return false;
  }

  return !isValidCalendarDate(
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10),
    Number.parseInt(match[3], 10)
  );
};

const isDigit = (char: string): boolean => char >= "0" && char <= "9";

const containsOnlyDigits = (value: string): boolean => {
  if (value === "") return false;
  for (const char of value) {
    if (!isDigit(char)) return false;
  }
  return true;
};

const isBareYearString = (value: string): boolean => value.length === 4 && containsOnlyDigits(value);

const isNumericString = (value: string): boolean => value !== "" && Number.isFinite(Number(value));

const parseUnsignedInteger = (value: string): number | null => {
  const trimmed = value.trim();
  if (!containsOnlyDigits(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
};

const createUtcDate = (year: number, month: number, day: number): Date | null => {
  if (year < 1000 || year > 9999 || !isValidCalendarDate(year, month, day)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
};

const parseBareYear = (year: number): Date | null => createUtcDate(year, 1, 1);

const parseNumberDate = (value: number): Date | null => {
  if (!Number.isFinite(value) || !Number.isInteger(value)) return null;

  if (value >= 1000 && value <= 9999) {
    return parseBareYear(value);
  }

  if (value >= UNIX_SECONDS_MIN && value <= UNIX_SECONDS_MAX) {
    const date = new Date(value * 1000);
    return isValidDate(date) ? date : null;
  }

  if (value >= UNIX_MILLISECONDS_MIN && value <= UNIX_MILLISECONDS_MAX) {
    const date = new Date(value);
    return isValidDate(date) ? date : null;
  }

  return null;
};

const parseDateParts = (parts: string[], order: readonly DatePart[]): Date | null => {
  if (parts.length !== 3) return null;

  let year = 0;
  let month = 0;
  let day = 0;

  for (let index = 0; index < order.length; index++) {
    const rawPart = parts[index]?.trim();
    if (!rawPart) return null;

    const parsed = parseUnsignedInteger(rawPart);
    if (parsed === null) return null;

    const component = order[index];
    if (component === "Y") {
      if (rawPart.length !== 4) return null;
      year = parsed;
    } else if (component === "M") {
      month = parsed;
    } else {
      day = parsed;
    }
  }

  return createUtcDate(year, month, day);
};

const parseTextMonthDate = (value: string, inputFormat: string): Date | null => {
  const cleaned = value.replaceAll(",", "").trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length !== 3) return null;

  let day = 0;
  let month = 0;
  let year = 0;

  if (inputFormat === "D MMMM YYYY") {
    day = parseUnsignedInteger(parts[0] ?? "") ?? 0;
    month = MONTH_NAMES[parts[1]?.toLowerCase() ?? ""] ?? 0;
    year = parseUnsignedInteger(parts[2] ?? "") ?? 0;
  } else {
    month = MONTH_NAMES[parts[0]?.toLowerCase() ?? ""] ?? 0;
    day = parseUnsignedInteger(parts[1] ?? "") ?? 0;
    year = parseUnsignedInteger(parts[2] ?? "") ?? 0;
  }

  return createUtcDate(year, month, day);
};

const parseKnownFormat = (value: string, inputFormat: string): Date | null => {
  if (inputFormat === "D MMMM YYYY" || inputFormat === "MMMM D, YYYY") {
    return parseTextMonthDate(value, inputFormat);
  }

  const pattern = FORMAT_PATTERNS[inputFormat];
  if (!pattern) return null;
  return parseDateParts(value.split(pattern.separator), pattern.order);
};

const inferDayMonthOrder = (
  first: number,
  second: number,
  separator: string
): readonly [DatePart, DatePart, DatePart] => {
  if (first > 12 && second <= 12) return ["D", "M", "Y"];
  if (second > 12 && first <= 12) return ["M", "D", "Y"];
  if (separator === ".") return ["D", "M", "Y"];
  return ["M", "D", "Y"];
};

const parseSeparatedDate = (value: string): { matched: boolean; date: Date | null } => {
  for (const separator of ["/", "-", "."]) {
    if (!value.includes(separator)) continue;

    const parts = value.split(separator);
    if (parts.length !== 3) continue;

    const first = parseUnsignedInteger(parts[0] ?? "");
    const second = parseUnsignedInteger(parts[1] ?? "");
    const third = parseUnsignedInteger(parts[2] ?? "");
    if (first === null || second === null || third === null) continue;

    if (parts[0]?.trim().length === 4) {
      return { matched: true, date: parseDateParts(parts, ["Y", "M", "D"]) };
    }

    return { matched: true, date: parseDateParts(parts, inferDayMonthOrder(first, second, separator)) };
  }

  return { matched: false, date: null };
};

const parseIsoDate = (value: string): Date | null => {
  if (!ISO_DATE_PREFIX_REGEX.test(value)) return null;
  if (hasInvalidIsoDatePart(value)) return null;

  const parsed = new Date(value);
  return isValidDate(parsed) ? parsed : null;
};

/**
 * Parse an untrusted import date using TimeTiles' safe ingest rules.
 */
export const parseImportDate = (value: ImportDateInput): Date | null => {
  if (value == null) return null;

  if (value instanceof Date) {
    return isValidDate(value) ? value : null;
  }

  if (typeof value === "number") {
    return parseNumberDate(value);
  }

  const trimmed = value.trim();
  if (trimmed === "") return null;

  if (isBareYearString(trimmed)) {
    return parseBareYear(Number.parseInt(trimmed, 10));
  }

  if (isNumericString(trimmed)) {
    return null;
  }

  const isoDate = parseIsoDate(trimmed);
  if (isoDate) return isoDate;

  const separated = parseSeparatedDate(trimmed);
  if (separated.matched) return separated.date;

  const textMonth = parseTextMonthDate(trimmed, "D MMMM YYYY") ?? parseTextMonthDate(trimmed, "MMMM D, YYYY");
  if (textMonth) return textMonth;

  return null;
};

/**
 * Parse an import date with a known transform input format.
 *
 * Known formats are strict: if the format is known but the value does not
 * match it, parsing fails. Unknown legacy format values fall back to the safe
 * auto-parser above instead of raw `new Date(value)`.
 */
export const parseImportDateWithFormat = (value: ImportDateInput, inputFormat?: string | null): Date | null => {
  const format = inputFormat?.trim() ?? "";
  const isKnownStructuredFormat = FORMAT_PATTERNS[format] !== undefined;
  const isKnownTextFormat = format === "D MMMM YYYY" || format === "MMMM D, YYYY";

  if (isKnownStructuredFormat || isKnownTextFormat) {
    return typeof value === "string" ? parseKnownFormat(value.trim(), format) : null;
  }

  return parseImportDate(value);
};

/**
 * True when a value can be parsed by the import date rules.
 */
export const isImportDateLike = (value: ImportDateInput): boolean => parseImportDate(value) !== null;
