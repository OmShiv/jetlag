import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatOffset,
  formatWall,
  isLeapYear,
  isoWeekYear,
  nextTransition,
  offsetMinutes,
  parseAt,
  wallClock,
  zonedToInstant,
} from '../src/zone.js';

const iso = (ms) => new Date(ms).toISOString();

test('offsets include half and quarter hours and daylight saving', () => {
  assert.equal(offsetMinutes(Date.UTC(2027, 0, 1), 'Asia/Kathmandu'), 345);
  assert.equal(offsetMinutes(Date.UTC(2027, 0, 1), 'Asia/Kolkata'), 330);
  assert.equal(offsetMinutes(Date.UTC(2026, 6, 1), 'America/New_York'), -240);
  assert.equal(offsetMinutes(Date.UTC(2027, 0, 1), 'America/New_York'), -300);
  assert.equal(offsetMinutes(Date.UTC(2027, 0, 1), 'Etc/GMT+12'), -720);
});

test('wall clock reads the local date and weekday', () => {
  const w = wallClock(Date.parse('2026-10-04T04:30:00Z'), 'America/Los_Angeles');
  assert.deepEqual(w, { year: 2026, month: 10, day: 3, hour: 21, minute: 30, second: 0, weekday: 6 });
});

test('zoned times convert to instants', () => {
  const at = (wall, tz) => iso(zonedToInstant(wall, tz));
  assert.equal(at({ year: 2026, month: 10, day: 3, hour: 21, minute: 30 }, 'America/Los_Angeles'), '2026-10-04T04:30:00.000Z');
  assert.equal(at({ year: 2027, month: 1, day: 1, hour: 12 }, 'Asia/Kathmandu'), '2027-01-01T06:15:00.000Z');
});

test('a repeated wall time resolves to its first occurrence', () => {
  const ms = zonedToInstant({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, 'America/New_York');
  assert.equal(iso(ms), '2026-11-01T05:30:00.000Z');
  assert.equal(offsetMinutes(ms, 'America/New_York'), -240);
});

test('a skipped wall time resolves to the instant after the gap', () => {
  const ms = zonedToInstant({ year: 2027, month: 3, day: 14, hour: 2, minute: 30 }, 'America/New_York');
  assert.equal(iso(ms), '2027-03-14T07:30:00.000Z');
  assert.equal(formatWall(ms, 'America/New_York'), 'Sun 2027-03-14 03:30 UTC-04:00');
});

test('finds the next daylight saving transitions', () => {
  const from = Date.parse('2026-10-03T07:00:00Z');
  const back = nextTransition(from, 'America/New_York', 'back');
  assert.deepEqual(back, { at: Date.parse('2026-11-01T06:00:00Z'), from: -240, to: -300, kind: 'back' });
  const forward = nextTransition(from, 'America/New_York', 'forward');
  assert.equal(iso(forward.at), '2027-03-14T07:00:00.000Z');
  assert.equal(forward.to - forward.from, 60);
  const lordHowe = nextTransition(from, 'Australia/Lord_Howe', 'forward');
  assert.equal(lordHowe.to - lordHowe.from, 30);
  assert.equal(nextTransition(from, 'Asia/Kolkata'), null);
});

test('ISO week-years and leap years', () => {
  assert.equal(isoWeekYear(2027, 1, 1), 2026);
  assert.equal(isoWeekYear(2027, 1, 4), 2027);
  assert.equal(isoWeekYear(2024, 12, 30), 2025);
  assert.equal(isLeapYear(2028), true);
  assert.equal(isLeapYear(2100), false);
  assert.equal(isLeapYear(2000), true);
});

test('formats offsets', () => {
  assert.equal(formatOffset(345), 'UTC+05:45');
  assert.equal(formatOffset(-210), 'UTC-03:30');
  assert.equal(formatOffset(0), 'UTC+00:00');
});

test('parses --at values', () => {
  assert.equal(iso(parseAt('2027-03-28T01:30', 'Europe/Paris')), '2027-03-28T00:30:00.000Z');
  assert.equal(iso(parseAt('2027-03-28', 'UTC')), '2027-03-28T00:00:00.000Z');
  assert.equal(iso(parseAt('2027-03-28T01:30:00Z', 'Europe/Paris')), '2027-03-28T01:30:00.000Z');
  assert.equal(iso(parseAt('2027-03-28T01:30+05:45', 'UTC')), '2027-03-27T19:45:00.000Z');
  assert.equal(parseAt('2027-02-30', 'UTC'), null);
  assert.equal(parseAt('tomorrow', 'UTC'), null);
});
