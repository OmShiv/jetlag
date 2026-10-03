import {
  formatOffset,
  formatShort,
  formatWall,
  isLeapYear,
  isoWeekYear,
  nextTransition,
  offsetMinutes,
  wallClock,
  zonedToInstant,
} from './zone.js';

// Every destination changes one thing your laptop never does: the time zone,
// the date, or the language. `at` pins the clock; `tz` and `locale` set TZ and
// LANG/LC_ALL for the test process.
export const DESTINATIONS = [
  // Time zones
  {
    id: 'utc',
    name: 'UTC',
    group: 'zones',
    tz: 'UTC',
    at: { time: '12:00' },
    why: "Most CI runners use UTC. If your machine doesn't, code that mixes local and UTC dates can pass on your laptop and fail in CI.",
  },
  {
    id: 'los-angeles-night',
    name: 'Los Angeles 9:30 PM',
    group: 'zones',
    tz: 'America/Los_Angeles',
    at: { time: '21:30' },
    why: "At 9:30 PM in Los Angeles it's already the next day in UTC, so new Date().toISOString().slice(0, 10) returns tomorrow's date.",
  },
  {
    id: 'kiritimati',
    name: 'Kiritimati 7:30 AM',
    group: 'zones',
    tz: 'Pacific/Kiritimati',
    at: { time: '07:30' },
    why: 'Kiritimati is UTC+14, the first place on Earth to start each day. Until 2 PM local time, its date is a day ahead of UTC.',
  },
  {
    id: 'kathmandu',
    name: 'Kathmandu',
    group: 'zones',
    tz: 'Asia/Kathmandu',
    at: { time: '12:00' },
    why: 'Nepal is UTC+05:45. Code that assumes offsets are whole hours, or rounds getTimezoneOffset() / 60, is 15 to 45 minutes off.',
  },
  {
    id: 'india',
    name: 'India',
    group: 'zones',
    tz: 'Asia/Kolkata',
    at: { time: '12:00' },
    why: 'India is UTC+05:30 all year. Half-hour offsets break code that stores or formats offsets as whole hours.',
  },
  {
    id: 'chatham',
    name: 'Chatham Islands',
    group: 'zones',
    tz: 'Pacific/Chatham',
    at: { time: '12:00' },
    why: 'The Chatham Islands use UTC+12:45, and UTC+13:45 during daylight saving: a 45-minute offset that also changes with the seasons.',
  },
  {
    id: 'lord-howe',
    name: 'Lord Howe Island',
    group: 'zones',
    tz: 'Australia/Lord_Howe',
    at: { time: '12:00' },
    why: 'Daylight saving on Lord Howe Island moves the clock by 30 minutes, not an hour. Code that adds or subtracts exactly one hour for DST is wrong here.',
  },
  {
    id: 'troll',
    name: 'Troll Station (Antarctica)',
    group: 'zones',
    tz: 'Antarctica/Troll',
    at: { time: '12:00' },
    why: 'Troll research station switches between UTC+00 and UTC+02: daylight saving that moves the clock by two hours.',
  },
  {
    id: 'sydney',
    name: 'Sydney',
    group: 'zones',
    tz: 'Australia/Sydney',
    at: { time: '12:00' },
    why: 'In the southern hemisphere, daylight saving runs from October to April. Code that assumes summer time falls in July is wrong here.',
  },
  {
    id: 'london',
    name: 'London',
    group: 'zones',
    tz: 'Europe/London',
    at: { time: '12:00' },
    why: 'London matches UTC only in winter. From late March to late October it is UTC+01, so code that treats London as UTC is an hour off for half the year.',
  },
  {
    id: 'casablanca',
    name: 'Casablanca',
    group: 'zones',
    tz: 'Africa/Casablanca',
    at: { time: '12:00' },
    why: 'Morocco is on UTC+01 most of the year and switches to UTC+00 for Ramadan, so its clock changes move with the lunar calendar.',
  },
  {
    id: 'anywhere-on-earth',
    name: 'Anywhere on Earth (UTC-12)',
    group: 'zones',
    tz: 'Etc/GMT+12',
    at: { time: '12:00' },
    why: 'UTC-12 is the last time zone to finish each day, which is why deadlines use it. Its IANA name is Etc/GMT+12 because POSIX-style names flip the sign.',
  },

  // Tricky dates
  {
    id: 'spring-forward',
    name: 'Spring forward (New York)',
    group: 'calendar',
    tz: 'America/New_York',
    at: { transition: 'forward', before: 30 * 60 },
    why: "Clocks jump from 1:59:59 AM to 3:00 AM. The day is 23 hours long, 2:30 AM doesn't exist, and adding 24 hours doesn't land on the same time tomorrow.",
  },
  {
    id: 'fall-back',
    name: 'Fall back (New York)',
    group: 'calendar',
    tz: 'America/New_York',
    at: { transition: 'back', before: 30 * 60 },
    why: 'Clocks go from 1:59:59 AM back to 1:00 AM. The day is 25 hours long, 1:30 AM happens twice, and adding 24 hours lands an hour early.',
  },
  {
    id: 'new-years-eve',
    name: "New Year's Eve 11:58 PM",
    group: 'calendar',
    at: { month: 12, day: 31, time: '23:58' },
    why: 'Two minutes to midnight on December 31. Code that reads the clock twice can straddle two years, and code that computes next month by hand produces month 13.',
  },
  {
    id: 'leap-day',
    name: 'Leap day',
    group: 'calendar',
    at: { month: 2, day: 29, time: '12:00' },
    why: 'February 29. "Same day next year" has no answer, and code that hard-codes 28 days in February or 365 days in a year is a day off.',
  },
  {
    id: 'month-end',
    name: 'January 31',
    group: 'calendar',
    at: { month: 1, day: 31, time: '12:00' },
    why: "Add one month to January 31 and JavaScript's setMonth() overflows to March 3 (March 2 in a leap year). Monthly dates drift.",
  },
  {
    id: 'iso-week',
    name: 'ISO week-year boundary',
    group: 'calendar',
    at: { isoWeekBoundary: true, time: '12:00' },
    why: "The ISO week-year differs from the calendar year here. Code that pairs an ISO week number with the calendar year, or formats with a week-year pattern like Java's YYYY, prints the wrong year.",
  },
  {
    id: 'sunday',
    name: 'Sunday',
    group: 'calendar',
    at: { weekday: 0, time: '12:00' },
    why: 'getDay() returns 0 on Sundays. Code that assumes weeks start on Monday, or uses getDay() - 1 as an index, breaks one day a week.',
  },
  {
    id: 'y2038',
    name: 'Y2038 rollover',
    group: 'calendar',
    at: { instant: '2038-01-19T03:14:08Z' },
    why: 'One second past 03:14:07 UTC on January 19, 2038, the largest signed 32-bit Unix time. Seconds stored in 32 bits, or truncated with | 0 in JavaScript, wrap to negative numbers.',
  },
  {
    id: 'year-2100',
    name: 'Year 2100',
    group: 'calendar',
    at: { year: 2100, month: 2, day: 28, time: '12:00' },
    why: "2100 is divisible by 4 but isn't a leap year, so tomorrow is March 1. A year % 4 === 0 leap-year check says February 29.",
  },

  // Languages
  {
    id: 'german',
    name: 'German',
    group: 'languages',
    locale: 'de_DE.UTF-8',
    why: "German formats 1234.5 as 1.234,5. Tests that expect US-formatted toLocaleString() output fail, and parseFloat('1,5') returns 1.",
  },
  {
    id: 'turkish',
    name: 'Turkish',
    group: 'languages',
    locale: 'tr_TR.UTF-8',
    why: "Turkish has a dotted and a dotless i (i/İ and ı/I). Locale-aware sorting and casing change, and Java's toUpperCase() and toLowerCase() follow this rule by default.",
  },
  {
    id: 'arabic',
    name: 'Arabic (Egypt)',
    group: 'languages',
    locale: 'ar_EG.UTF-8',
    why: 'Numbers format with Arabic-Indic digits by default (١٬٢٣٤٫٥). Parsing localized output back with Number() returns NaN.',
  },
  {
    id: 'thai',
    name: 'Thai',
    group: 'languages',
    locale: 'th_TH.UTF-8',
    why: 'The default calendar is Buddhist, so toLocaleDateString() reports the year 2026 as 2569.',
  },
  {
    id: 'persian',
    name: 'Persian (Iran)',
    group: 'languages',
    locale: 'fa_IR.UTF-8',
    why: 'The default calendar is the Solar Hijri calendar, written with Persian digits: October 3, 2026 formats as ۱۴۰۵/۷/۱۱.',
  },
  {
    id: 'hindi',
    name: 'Hindi (India)',
    group: 'languages',
    locale: 'hi_IN.UTF-8',
    why: 'Indian digit grouping puts a comma every two digits after the first three: 1234567 formats as 12,34,567.',
  },
  {
    id: 'posix',
    name: 'POSIX "C" locale',
    group: 'languages',
    locale: 'C',
    why: 'The plain C locale has no UTF-8. Ruby defaults to US-ASCII here, and tools that pick an encoding from LANG mangle non-ASCII text.',
  },
];

export const GROUPS = {
  zones: 'Time zones',
  calendar: 'Tricky dates',
  languages: 'Languages',
};

const ids = (group) => DESTINATIONS.filter((d) => d.group === group).map((d) => d.id);

export const TRIPS = {
  quick: [
    'utc',
    'los-angeles-night',
    'kiritimati',
    'kathmandu',
    'spring-forward',
    'new-years-eve',
    'leap-day',
    'month-end',
    'german',
    'thai',
  ],
  zones: ids('zones'),
  calendar: ids('calendar'),
  languages: ids('languages'),
  world: DESTINATIONS.map((d) => d.id),
};

export function findDestination(id) {
  return DESTINATIONS.find((d) => d.id === id);
}

// Turns `at` specs into an instant. Relative specs ("next leap day") resolve
// against `now`, in the destination's zone or, if it has none, the home zone.
export function resolveDestination(dest, { now = Date.now(), homeTz }) {
  const clockTz = dest.tz ?? homeTz;
  const pinned = dest.at ? resolveAt(dest.at, clockTz, now) : null;
  return { ...dest, clockTz, now: pinned };
}

function resolveAt(spec, tz, now) {
  if (spec.instant) return Date.parse(spec.instant);
  if (spec.transition) {
    const t = nextTransition(now, tz, spec.transition);
    return t ? t.at - (spec.before ?? 0) * 1000 : null;
  }

  const [hour, minute] = (spec.time ?? '12:00').split(':').map(Number);
  const at = (year, month, day) => zonedToInstant({ year, month, day, hour, minute }, tz);
  const today = wallClock(now, tz);

  if (spec.year) return at(spec.year, spec.month, spec.day);

  if (spec.month) {
    for (let year = today.year; year < today.year + 9; year++) {
      if (spec.month === 2 && spec.day === 29 && !isLeapYear(year)) continue;
      const upcoming = year > today.year || spec.month > today.month || (spec.month === today.month && spec.day >= today.day);
      if (upcoming) return at(year, spec.month, spec.day);
    }
    return null;
  }

  if (spec.weekday !== undefined || spec.isoWeekBoundary) {
    for (let i = 0; i < 800; i++) {
      const d = new Date(Date.UTC(today.year, today.month - 1, today.day + i));
      const [y, m, day] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
      const match = spec.isoWeekBoundary ? isoWeekYear(y, m, day) !== y : d.getUTCDay() === spec.weekday;
      if (match) return at(y, m, day);
    }
    return null;
  }

  return at(today.year, today.month, today.day);
}

// A one-line summary of where and when a destination runs.
export function describe(dest) {
  const parts = [];
  // Time zone destinations run today, so the month and day are enough.
  if (dest.now != null) parts.push(dest.group === 'zones' ? formatShort(dest.now, dest.clockTz) : formatWall(dest.now, dest.clockTz));
  else if (dest.tz) parts.push(formatOffset(offsetMinutes(Date.now(), dest.tz)));
  if (dest.tz && dest.tz !== 'UTC') parts.push(dest.tz);
  if (dest.locale) parts.push(dest.locale);
  return parts.join('  ');
}
