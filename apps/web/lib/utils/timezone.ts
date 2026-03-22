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
  return parseParts(createTimezoneFormatter(timezone), utcDate);
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
 * This uses a binary-search approach: we start with an initial UTC guess
 * (treating the components as if they were UTC), then adjust based on the
 * observed offset.
 */
export const wallClockToUtc = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string
): Date => {
  // Start with a naive UTC guess
  const naiveUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));

  // See what wall-clock time that UTC instant corresponds to in the target timezone
  const observed = getDatePartsInTimezone(naiveUtc, timezone);

  // Calculate the offset in minutes between what we wanted and what we got
  const wantedMinutes = hour * 60 + minute;
  const observedMinutes = observed.hour * 60 + observed.minute;

  // Also account for date differences (DST transitions can shift the date)
  let dayDiffMinutes = 0;
  if (observed.day !== day || observed.month !== month || observed.year !== year) {
    // Use a simpler approach: compute the difference in epoch time
    const wantedEpoch = Date.UTC(year, month - 1, day);
    const observedEpoch = Date.UTC(observed.year, observed.month - 1, observed.day);
    dayDiffMinutes = (observedEpoch - wantedEpoch) / 60_000;
  }

  const offsetMinutes = observedMinutes - wantedMinutes + dayDiffMinutes;

  // Adjust: if observed time is ahead of wanted, the UTC time should be later
  // (we need to subtract the offset)
  return new Date(naiveUtc.getTime() - offsetMinutes * 60_000);
};
