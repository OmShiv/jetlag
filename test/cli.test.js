import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { classify, parseArgs, selectDestinations } from '../src/cli.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = join(root, 'test/fixtures/hazards');
const bin = join(root, 'bin/jetlag.js');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const leapDayToday = (() => {
  const d = new Date();
  return d.getMonth() === 1 && d.getDate() === 29;
})();

function jetlag(args, env = {}) {
  const base = { ...process.env };
  delete base.NODE_TEST_CONTEXT; // set by node --test; it changes how the nested runner reports
  return spawnSync(process.execPath, [bin, ...args], {
    cwd: fixture,
    encoding: 'utf8',
    env: { ...base, TZ: 'UTC', LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8', NO_COLOR: '1', ...env },
  });
}

const report = (run) => {
  const r = JSON.parse(run.stdout);
  return Object.fromEntries([['home', r.home], ...r.destinations.map((d) => [d.id, d])]);
};

test('sends the suite to the destinations that break it', { skip: leapDayToday }, () => {
  const run = jetlag(['--json', '--only', 'utc,leap-day,kathmandu,german,sunday', '--', 'node', '--test']);
  assert.equal(run.status, 1, run.stderr);
  const r = report(run);
  assert.equal(r.home.status, 'pass');
  assert.equal(r.utc.status, 'pass');
  assert.equal(r.sunday.status, 'pass');
  assert.deepEqual(r['leap-day'].newFailing, ['it is not February 29']);
  assert.deepEqual(r.kathmandu.newFailing, ['the offset is a whole hour']);
  assert.deepEqual(r.german.newFailing, ['numbers format like en-US']);
  assert.equal(r['leap-day'].clock.slice(5, 10), '02-29');
  assert.equal(r['leap-day'].clockMoved, true);
});

test('exits 0 when every destination passes', () => {
  const run = jetlag(['--json', '--only', 'utc,sunday', '--', 'node', '--test']);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(Object.values(report(run)).map((d) => d.status), ['pass', 'pass', 'pass']);
});

test("skips dates when the command's runtime can't move the clock", () => {
  const run = jetlag(['--json', '--only', 'utc,leap-day', '--', 'sh', '-c', 'exit 0']);
  assert.equal(run.status, 0, run.stderr);
  const r = report(run);
  assert.equal(r['leap-day'].status, 'skipped');
  assert.equal(r.utc.status, 'pass');
  assert.equal(r.utc.clockMoved, false);
});

test('reports only new failures when the suite already fails at home', { skip: leapDayToday }, () => {
  const run = jetlag(['--json', '--only', 'german,leap-day', '--', 'node', '--test'], { LANG: 'de_DE.UTF-8', LC_ALL: 'de_DE.UTF-8' });
  assert.equal(run.status, 1, run.stderr);
  const r = report(run);
  assert.equal(r.home.status, 'home-fail');
  assert.deepEqual(r.home.failing, ['numbers format like en-US']);
  assert.equal(r.german.status, 'same');
  assert.equal(r['leap-day'].status, 'fail');
  assert.deepEqual(r['leap-day'].newFailing, ['it is not February 29']);
});

test('visits a custom destination', () => {
  const run = jetlag(['--json', '--tz', 'Asia/Kolkata', '--at', '2027-01-01T09:00', '--', 'node', '--test']);
  assert.equal(run.status, 1, run.stderr);
  const { custom } = report(run);
  assert.equal(custom.clock, '2027-01-01T03:30:00.000Z');
  assert.deepEqual(custom.newFailing, ['the offset is a whole hour']);
});

test('prints a readable report', { skip: leapDayToday }, () => {
  const run = jetlag(['--only', 'leap-day,utc', '--', 'node', '--test']);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /✗ 1 destination broke 1 test\./);
  assert.match(run.stdout, /✗ it is not February 29/);
  assert.match(run.stdout, /debug: jetlag exec leap-day -- node --test/);
  assert.doesNotMatch(run.stdout, /\x1b\[/);
});

test('exec runs one destination in the foreground', () => {
  const script = 'console.log(process.env.TZ, new Date().getTimezoneOffset(), new Date().getHours())';
  const run = jetlag(['exec', 'kathmandu', '--', 'node', '-e', script]);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), 'Asia/Kathmandu -345 12');
  assert.match(run.stderr, /Kathmandu/);
});

test("exec says so when the clock doesn't move", () => {
  const run = jetlag(['exec', 'leap-day', '--', 'sh', '-c', 'exit 3']);
  assert.equal(run.status, 3);
  assert.match(run.stderr, /the clock didn't move/);
});

test('list shows every destination', () => {
  const run = jetlag(['list']);
  assert.equal(run.status, 0);
  for (const id of ['utc', 'kathmandu', 'spring-forward', 'y2038', 'german', 'posix']) assert.match(run.stdout, new RegExp(`\\b${id}\\b`));
});

test('usage errors exit 2 with a message', () => {
  const cases = [
    [['--nope', 'npm', 'test'], /unknown option --nope/],
    [['--only', 'mars', '--', 'true'], /no destination or trip called "mars"/],
    [['--trip', 'moon', '--', 'true'], /no trip called "moon"/],
    [['--tz', 'Mars/Olympus', '--', 'true'], /isn't an IANA time zone/],
    [['--at', 'soon', '--', 'true'], /--at needs a date/],
    [['--jobs', '0', '--', 'true'], /--jobs needs a positive whole number/],
    [['exec', 'mars', '--', 'true'], /no destination called "mars"/],
    [['exec', 'utc'], /give jetlag a command/],
  ];
  for (const [args, message] of cases) {
    const run = jetlag(args);
    assert.equal(run.status, 2, args.join(' '));
    assert.match(run.stderr, message);
  }
});

test('help and version', () => {
  assert.match(jetlag(['--help']).stdout, /Usage/);
  assert.equal(jetlag(['--help']).status, 0);
  assert.equal(jetlag([]).status, 2);
  assert.equal(jetlag(['--version']).stdout.trim(), version);
});

test('parses options up to the command', () => {
  const opts = parseArgs(['-j', '2', '--only=utc,thai', '--skip', 'thai', 'npm', 'test', '--watch']);
  assert.equal(opts.jobs, 2);
  assert.deepEqual(opts.only, ['utc', 'thai']);
  assert.deepEqual(opts.skip, ['thai']);
  assert.deepEqual(opts.command, ['npm', 'test', '--watch']);
  const exec = parseArgs(['exec', 'kathmandu', '--', 'node', '-v']);
  assert.equal(exec.sub, 'exec');
  assert.equal(exec.destination, 'kathmandu');
  assert.deepEqual(exec.command, ['node', '-v']);
});

test('selects trips, expands trip names, and skips', () => {
  const ids = (opts) => selectDestinations({ only: [], skip: [], ...opts }, { homeTz: 'UTC', now: Date.parse('2026-10-03T12:00:00Z') }).map((d) => d.id);
  assert.equal(ids({}).length, 10);
  assert.deepEqual(ids({ only: ['languages'], skip: ['posix', 'hindi'] }), ['german', 'turkish', 'arabic', 'thai', 'persian']);
  assert.ok(ids({ trip: 'world' }).includes('troll'));
});

test('classifies results against home', () => {
  const dest = { group: 'zones', now: 1 };
  const home = { code: 1, failing: ['a'] };
  const run = (code, failing, shifted = ['node']) => classify({ dest, code, failing, shifted, timedOut: false }, home);
  assert.equal(run(1, ['a']).status, 'same');
  assert.deepEqual(run(1, ['a', 'b']).newFailing, ['b']);
  assert.equal(run(1, []).status, 'unknown');
  assert.equal(run(0, []).status, 'pass');
  assert.equal(classify({ dest: { group: 'calendar', now: 1 }, code: 0, failing: [], shifted: [], timedOut: false }, home).status, 'skipped');
});
