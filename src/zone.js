// Wall-clock math for IANA time zones, using nothing but Intl.

const formatters = new Map();
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const DAY = 86_400_000;

function formatter(tz) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz) {
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

export function localTimeZone() {
  const env = process.env.TZ;
  if (env && !env.startsWith(':') && isValidTimeZone(env)) return env;
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// The calendar date and time an instant shows on a wall clock in `tz`.
export function wallClock(ms, tz) {
  const p = {};
  for (const { type, value } of formatter(tz).formatToParts(new Date(ms))) p[type] = value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: WEEKDAYS[p.weekday],
  };
}

// Minutes ahead of UTC in `tz` at instant `ms` (Kathmandu: 345).
export function offsetMinutes(ms, tz) {
  const w = wallClock(ms, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

function sameWall(a, b) {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === (b.hour ?? 0) &&
    a.minute === (b.minute ?? 0) &&
    a.second === (b.second ?? 0)
  );
}

// The instant a wall-clock time happens in `tz`. When the time happens twice
// (clocks fall back), this returns the first one. When it never happens
// (clocks spring forward), it returns the instant just after the gap, which is
// what JavaScript's Date does.
export function zonedToInstant(wall, tz) {
  const { year, month, day, hour = 0, minute = 0, second = 0 } = wall;
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  const candidates = new Set(
    [naive - DAY / 2, naive, naive + DAY / 2].map((probe) => naive - offsetMinutes(probe, tz) * 60_000),
  );
  const sorted = [...candidates].sort((a, b) => a - b);
  const valid = sorted.filter((ms) => sameWall(wallClock(ms, tz), { year, month, day, hour, minute, second }));
  return valid.length ? valid[0] : sorted[sorted.length - 1];
}

// The next time `tz` changes its UTC offset after `fromMs`. `kind` filters for
// 'forward' (clocks jump ahead) or 'back' (clocks repeat an hour).
export function nextTransition(fromMs, tz, kind) {
  const step = 6 * 3_600_000;
  let prev = offsetMinutes(fromMs, tz);
  for (let t = fromMs + step; t <= fromMs + 800 * DAY; t += step) {
    const off = offsetMinutes(t, tz);
    if (off === prev) continue;
    let lo = Math.floor((t - step) / 1000);
    let hi = Math.ceil(t / 1000);
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (offsetMinutes(mid * 1000, tz) === prev) lo = mid;
      else hi = mid;
    }
    const found = { at: hi * 1000, from: prev, to: off, kind: off > prev ? 'forward' : 'back' };
    if (!kind || found.kind === kind) return found;
    prev = off;
  }
  return null;
}

export function isoWeekYear(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  const mondayBased = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - mondayBased + 3); // the Thursday of this week
  return d.getUTCFullYear();
}

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function formatOffset(minutes) {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

const pad = (n) => String(n).padStart(2, '0');
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "Sat 2026-10-03 21:30 UTC-07:00"
export function formatWall(ms, tz) {
  const w = wallClock(ms, tz);
  return `${DAY_NAMES[w.weekday]} ${w.year}-${pad(w.month)}-${pad(w.day)} ${pad(w.hour)}:${pad(w.minute)} ${formatOffset(offsetMinutes(ms, tz))}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "Oct 3 21:30 UTC-07:00"
export function formatShort(ms, tz) {
  const w = wallClock(ms, tz);
  return `${MONTHS[w.month - 1]} ${w.day} ${pad(w.hour)}:${pad(w.minute)} ${formatOffset(offsetMinutes(ms, tz))}`;
}

// "2027-03-28T01:30" as a wall time in `tz`, or an absolute ISO instant.
export function parseAt(text, tz) {
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const ms = Date.parse(text);
    return Number.isNaN(ms) ? null : ms;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (!m) return null;
  const [, year, month, day, hour = 0, minute = 0, second = 0] = m.map((v, i) => (i && v !== undefined ? Number(v) : v));
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  if (day < 1 || new Date(Date.UTC(year, month - 1, day)).getUTCDate() !== day) return null;
  return zonedToInstant({ year, month, day, hour, minute, second }, tz);
}
