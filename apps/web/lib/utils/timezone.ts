/**
 * Timezone conversion utilities using the built-in Intl API.
 *
 * Provides functions to convert between IANA timezones and UTC for
 * scheduled ingest scheduling. Uses Intl.DateTimeFormat exclusively
 * (no external timezone libraries) to keep the dependency footprint small.
 *
 * @module
 * @category Utils
 */

/**
 * Validate that a string is a valid IANA timezone identifier.
 *
 * Uses Intl.DateTimeFormat which throws RangeError for invalid timezones.
 */
export const isValidTimezone = (timezone: string): boolean => {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
};

/** The shape returned by date-part extraction functions. */
export interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number;
}

const DAY_OF_WEEK_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Parse DateParts from an already-created Intl.DateTimeFormat. */
const parseParts = (formatter: Intl.DateTimeFormat, utcDate: Date): DateParts => {
  const parts = formatter.formatToParts(utcDate);
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? "0";
  const rawHour = Number.parseInt(get("hour"), 10);
  return {
    year: Number.parseInt(get("year"), 10),
    month: Number.parseInt(get("month"), 10),
    day: Number.parseInt(get("day"), 10),
    hour: rawHour === 24 ? 0 : rawHour,
    minute: Number.parseInt(get("minute"), 10),
    second: Number.parseInt(get("second"), 10),
    dayOfWeek: DAY_OF_WEEK_MAP[get("weekday")] ?? 0,
  };
};

/**
 * Create a reusable Intl.DateTimeFormat for the given timezone.
 *
 * This avoids the overhead of constructing a new formatter on every call,
 * which is critical when iterating minute-by-minute (e.g. cron matching).
 */
export const createTimezoneFormatter = (timezone: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  });

/**
 * Get the individual date/time components of a UTC Date as they appear
 * in the given IANA timezone.
 *
 * For example, 2024-01-15T23:30:00Z in "Europe/Berlin" (UTC+1 in winter)
 * returns { year: 2024, month: 1, day: 16, hour: 0, minute: 30, ... }
 * because it is already January 16 00:30 in Berlin.
 */
export const getDatePartsInTimezone = (utcDate: Date, timezone: string): DateParts => {
  return getDatePartsWithFormatter(utcDate, createTimezoneFormatter(timezone));
};

/**
 * Fast version of getDatePartsInTimezone that reuses a pre-created formatter.
 *
 * Use this in tight loops (e.g. cron matching) where the same timezone is
 * checked for many different dates.
 */
export const getDatePartsWithFormatter = (utcDate: Date, formatter: Intl.DateTimeFormat): DateParts => {
  return parseParts(formatter, utcDate);
};

/**
 * Convert a wall-clock time in a given timezone to the equivalent UTC Date.
 *
 * Given a set of date/time components that represent a wall-clock time in
 * the specified timezone, returns the corresponding UTC Date.
 *
 * We want a UTC instant `t` whose local time in `timezone` equals the given
 * wall-clock. Since the zone offset is itself a function of `t`, we solve
 * `t = wanted - offset(t)` by fixed-point iteration. A single correction is
 * wrong when the first estimate lands on the opposite side of a DST boundary
 * from the answer (the offset differs by an hour), so we run a second pass,
 * which converges for standard whole-hour DST transitions.
 */
export const wallClockToUtc = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string
): Date => {
  // The desired wall-clock expressed as a UTC epoch (offset 0).
  const wantedMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const formatter = createTimezoneFormatter(timezone);

  // The zone's offset at instant `t`: (local wall-clock of `t`, expressed as a
  // UTC epoch) minus `t`.
  const offsetMs = (t: number): number => {
    const o = getDatePartsWithFormatter(new Date(t), formatter);
    return Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute, o.second, 0) - t;
  };

  const firstPass = wantedMs - offsetMs(wantedMs);
  const corrected = wantedMs - offsetMs(firstPass);
  return new Date(corrected);
};
