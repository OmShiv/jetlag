import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DESTINATIONS, TRIPS, describe, resolveDestination } from '../src/destinations.js';
import { isValidTimeZone } from '../src/zone.js';

const NOW = Date.parse('2026-10-03T07:27:00Z'); // Saturday, 00:27 in Los Angeles
const HOME = 'America/Los_Angeles';
const at = (id) => {
  const d = resolveDestination(DESTINATIONS.find((x) => x.id === id), { now: NOW, homeTz: HOME });
  return d.now == null ? null : new Date(d.now).toISOString();
};

test('every destination is well formed', () => {
  const ids = new Set();
  for (const d of DESTINATIONS) {
    assert.ok(/^[a-z0-9-]+$/.test(d.id), d.id);
    assert.ok(!ids.has(d.id), `duplicate ${d.id}`);
    ids.add(d.id);
    assert.ok(['zones', 'calendar', 'languages'].includes(d.group), d.id);
    assert.ok(d.why.length > 40, d.id);
    assert.ok(!/[\u2014\u2013]/.test(d.why + d.name), `${d.id} uses a dash we don't use`);
    assert.ok(!d.name.includes(','), `${d.id}: names are joined with commas in reports`);
    if (d.tz) assert.ok(isValidTimeZone(d.tz), d.tz);
  }
});

test('every trip lists real destinations', () => {
  for (const [name, ids] of Object.entries(TRIPS)) {
    assert.ok(ids.length > 0, name);
    for (const id of ids) assert.ok(DESTINATIONS.some((d) => d.id === id), `${name}: ${id}`);
  }
  assert.equal(TRIPS.world.length, DESTINATIONS.length);
});

test('time zone destinations pin a local time of day, today', () => {
  assert.equal(at('utc'), '2026-10-03T12:00:00.000Z');
  assert.equal(at('los-angeles-night'), '2026-10-04T04:30:00.000Z');
  assert.equal(at('kathmandu'), '2026-10-03T06:15:00.000Z');
  // It is already the afternoon of October 3 in Kiritimati.
  assert.equal(at('kiritimati'), '2026-10-02T17:30:00.000Z');
  assert.equal(at('anywhere-on-earth'), '2026-10-03T00:00:00.000Z');
});

test('calendar destinations find the next occurrence', () => {
  assert.equal(at('spring-forward'), '2027-03-14T06:30:00.000Z');
  assert.equal(at('fall-back'), '2026-11-01T05:30:00.000Z');
  assert.equal(at('new-years-eve'), '2027-01-01T07:58:00.000Z');
  assert.equal(at('leap-day'), '2028-02-29T20:00:00.000Z');
  assert.equal(at('month-end'), '2027-01-31T20:00:00.000Z');
  assert.equal(at('iso-week'), '2027-01-01T20:00:00.000Z');
  assert.equal(at('sunday'), '2026-10-04T19:00:00.000Z');
  assert.equal(at('y2038'), '2038-01-19T03:14:08.000Z');
  assert.equal(at('year-2100'), '2100-02-28T20:00:00.000Z');
});

test('language destinations leave the clock alone', () => {
  for (const d of DESTINATIONS.filter((x) => x.group === 'languages')) {
    assert.equal(at(d.id), null, d.id);
    assert.ok(d.locale, d.id);
  }
});

test('describe says where and when', () => {
  const d = resolveDestination(DESTINATIONS.find((x) => x.id === 'kathmandu'), { now: NOW, homeTz: HOME });
  assert.equal(describe(d), 'Oct 3 12:00 UTC+05:45  Asia/Kathmandu');
  const leap = resolveDestination(DESTINATIONS.find((x) => x.id === 'leap-day'), { now: NOW, homeTz: HOME });
  assert.equal(describe(leap), 'Tue 2028-02-29 12:00 UTC-08:00');
  const german = resolveDestination(DESTINATIONS.find((x) => x.id === 'german'), { now: NOW, homeTz: HOME });
  assert.equal(describe(german), 'de_DE.UTF-8');
});
